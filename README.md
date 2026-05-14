# Generative UI Global Hackathon — Agentic Interfaces Starter Kit

> **Starter kit completo para construir interfaces agénticas con UI generativa.**

Una aplicación full-stack funcional que combina un agente LangGraph, un canvas kanban de leads sincronizado por IA, hilos de conversación persistentes (Postgres), integración real con Notion vía MCP, y un servidor MCP desplegable que corre nativo en Claude y ChatGPT.

**Stack:** Next.js 15 · LangChain Deep Agents · CopilotKit · Gemini · Notion MCP · Manufact

---

## Tabla de Contenidos

1. [Arquitectura General](#arquitectura-general)
2. [Flujo de Información — Pipeline Completo](#flujo-de-información--pipeline-completo)
3. [Flujo de Sincronización con Notion](#flujo-de-sincronización-con-notion)
4. [Flujo HITL — Email Draft con Human-in-the-Loop](#flujo-hitl--email-draft)
5. [Generative UI — 3 Paradigmas](#generative-ui--3-paradigmas)
6. [MCP Server Desplegable](#mcp-server-desplegable)
7. [Stack Técnico](#stack-técnico)
8. [Estructura del Proyecto](#estructura-del-proyecto)
9. [Instalación y Setup](#instalación-y-setup)
10. [Puertos de Referencia](#puertos-de-referencia)

---

## Arquitectura General

```mermaid
graph TB
    subgraph Frontend ["🖥️ Next.js 15 + React 19 (puerto 3010)"]
        direction LR
        Sidebar["ThreadsDrawer\nhilos persistentes\n(Postgres-backed)"]
        Canvas["LeadCanvas\nPipelineBoard · QuickStats\nStatusDonut · WorkshopDemand"]
        Chat["CopilotSidebar\nchat con el agente"]
        InlineUI["Inline Generative UI\nLeadMiniCard · EmailDraftCard\nrendereado por el agente en el chat"]
    end

    subgraph BFF ["⚙️ Hono BFF (puerto 4010)"]
        CopilotRuntime["CopilotRuntime v2\nCopilotKitIntelligence\nLangGraphAgent → :8133"]
        ErrorMiddleware["Error remapping\nPostgres seed\nthread-lock failures"]
    end

    subgraph Agent ["🤖 LangGraph Deep Agent Python (puerto 8133)"]
        MainPy["main.py\nboot: wipe orphan threads\nbuild graph · resolve runtime"]
        Runtime["runtime.py\nbuild_graph()\n4 runtimes: gemini-deep · gemini-react\nclaude-react · noop"]
        Prompts["prompts.py\nLEAD_TRIAGE_PROMPT\nbuild_system_prompt()"]

        subgraph Middleware_ ["Middleware chain"]
            Timing["TimingMiddleware\nwall-clock logging"]
            LeadState["LeadStateMiddleware\nauto-hydrate state.leads\nen primer turno"]
            CopilotMW["CopilotKitMiddleware"]
        end

        subgraph Tools_ ["Tools @tool LangChain"]
            FetchLeads["fetch_notion_leads()"]
            UpdateLead["update_notion_lead()"]
            InsertLead["insert_notion_lead()"]
            FindLead["find_lead()"]
            PostComment["post_lead_comment()"]
        end

        NotionMCP["notion_mcp.py\nmcp-use wrapper\nspawn npx @notionhq/notion-mcp-server\npor llamada"]
        LeadStore["lead_store.py\nNotionStore | LocalJsonStore\n50 leads de seed si no hay Notion"]
    end

    subgraph Intelligence ["📊 CopilotKit Intelligence (Docker)"]
        Postgres[("PostgreSQL 16\nhilos · mensajes")]
        Redis[("Redis 7\ncaché")]
        AppAPI["app-api :4201"]
        Gateway["realtime-gateway :4401"]
    end

    subgraph MCP ["🔌 MCP Server Desplegable (puerto 3011)"]
        MCPTools6["6 Tools:\n• show-lead-list\n• show-lead-demand\n• show-lead-pipeline\n• show-canvas-dashboard\n• show-email-draft\n• post-email-comment"]
    end

    subgraph External ["☁️ Externo"]
        NotionAPI["Notion API\nleads database"]
        GeminiLLM["Gemini 3.1 Flash-Lite\n(default LLM)"]
        ClaudeAlt["Claude Sonnet 4.6\n(alternativo: 1 env-var)"]
        ExternalAgents["Claude · ChatGPT\nvía MCP protocol"]
    end

    Frontend <-->|"proxy /api/copilotkit → :4010"| BFF
    BFF <-->|"LangGraphAgent recursion_limit=60"| Agent
    Agent --> Middleware_
    Middleware_ --> Tools_
    Tools_ <--> NotionMCP
    NotionMCP <-->|"MCP tools"| NotionAPI
    Agent --> GeminiLLM & ClaudeAlt
    BFF <--> Intelligence
    Intelligence --> Postgres & Redis
    MCP <-->|"6 tools con widgets"| ExternalAgents
```

---

## Flujo de Información — Pipeline Completo

Cómo viaja la información desde que el usuario abre el browser hasta que el canvas se actualiza.

```mermaid
flowchart TD
    subgraph Boot ["🚀 Boot sequence"]
        A["npm run dev\ncheck-env.sh valida todas las env vars"]
        A --> B["docker compose up\nPostgres + Redis + Intelligence"]
        B --> C["seed-default-user.sh\nusuario por defecto en Postgres"]
        C --> D["3 procesos en paralelo:\nNext.js :3010\nHono BFF :4010\nLangGraph agent :8133"]
        D --> E["Agent boot:\n• wipe_orphan_threads()\n• lead_store health check\n• build_system_prompt() con estado integración\n• build_graph() con runtime elegido"]
    end

    E --> F

    subgraph BrowserOpen ["🌐 Usuario abre el browser"]
        F["GET http://localhost:3010/leads"]
        F --> G["CopilotKitProviderShell\napunta a /api/copilotkit (→ BFF :4010)"]
        G --> H["ThreadsDrawer\ncarga hilos de Intelligence (Postgres)"]
        H --> I["Primer turno del hilo:\nLeadStateMiddleware detecta state.leads vacío\nauto-hidrata desde LeadStore"]
        I --> J["Canvas se puebla\nsin que el usuario diga nada"]
    end

    J --> K

    subgraph ChatMessage ["💬 Usuario envía mensaje"]
        K["CopilotSidebar\nenvía mensaje + threadId"]
        K --> L["BFF: CopilotRuntime\nrouta a LangGraphAgent :8133\nrecursion_limit: 60"]
        L --> M["TimingMiddleware → LeadStateMiddleware\n→ CopilotKitMiddleware"]
        M --> N["Deep Agent planner (deepagents)\ndescompone en TODO plan\nejecutado paso a paso"]
    end

    N --> O

    subgraph AgentProcessing ["🤖 Agente procesa la tarea"]
        O{{"¿Tipo de operación?"}}

        O -->|"Leer leads de Notion"| P["fetch_notion_leads()\n→ notion_mcp.py\nspawn npx @notionhq/notion-mcp-server\n→ API-query-data-source\n→ rows mapeadas a Lead TypedDicts\n→ Command(update=state.leads)"]

        O -->|"Mutar canvas"| Q["Frontend tools via useFrontendTool:\nsetLeads · setFilter · selectLead\nhighlightLeads · renderLeadMiniCard\nrenderEmailDraft\n→ forwarded vía CopilotKit runtime protocol"]

        O -->|"Actualizar Notion"| R["update_notion_lead()\n→ mcp_update_page()\n→ Notion API PATCH\n+ Command(update=state.leads)"]
    end

    P & Q & R --> S

    subgraph StateSync ["📡 State snapshot → UI"]
        S["Agente emite STATE_SNAPSHOT events\nvía AG-UI protocol"]
        S --> T["CopilotRuntime stream → Frontend"]
        T --> U["React canvas reads agent.state\n(typed as AgentState)"]
        U --> V["Re-render:\nPipelineBoard actualiza kanban\nQuickStats / StatusDonut / WorkshopDemand\nrecomputan"]
    end
```

---

## Flujo de Sincronización con Notion

El agente usa `mcp-use` para comunicarse con Notion sin importar el driver directamente.

```mermaid
sequenceDiagram
    participant User as 👤 Usuario
    participant Agent as LangGraph Agent
    participant NotionMCP as notion_mcp.py
    participant MCPServer as @notionhq/notion-mcp-server\n(npx spawned)
    participant NotionAPI as Notion REST API
    participant State as state.leads

    User->>Agent: "Muéstrame los leads del Workshop React"

    Agent->>NotionMCP: fetch_notion_leads()
    NotionMCP->>MCPServer: spawn npx @notionhq/notion-mcp-server\n(con NOTION_TOKEN en env)
    MCPServer-->>NotionMCP: MCP tools disponibles

    NotionMCP->>MCPServer: API-query-data-source\n{database_id, filter: {workshop: "React"}}
    MCPServer->>NotionAPI: POST /databases/{id}/query
    NotionAPI-->>MCPServer: rows paginadas de leads
    MCPServer-->>NotionMCP: rows en formato MCP

    NotionMCP->>NotionMCP: mapear a Lead TypedDicts\n{id, name, email, status, workshop, ...}
    NotionMCP-->>Agent: Command(update={"leads": [...]})

    Agent->>State: state.leads actualizado
    Agent-->>User: STATE_SNAPSHOT → canvas re-renderiza\nPipelineBoard muestra leads filtrados
```

---

## Flujo HITL — Email Draft

El Human-in-the-Loop del email draft usa un frontend tool con render inline en el chat.

```mermaid
flowchart TD
    A(["👤 Usuario: 'Escribe email de seguimiento para Ana García'"]) --> B

    B["Agente identifica lead\nfind_lead(name='Ana García')"]
    B --> C["renderEmailDraft()\nFrontend tool con render function"]
    C --> D["EmailDraftCard monta inline en el chat\n{leadId, subject, body}\nEditable por el usuario"]

    D --> E{{"¿Qué hace el usuario?"}}

    E -->|"Edita y hace clic en Send"| F["onSend()\nllama a injectPrompt()\n'Envía email a Ana García:\n  asunto: {subject}\n  cuerpo: {body}'"]
    E -->|"Hace clic en Discard"| G["EmailDraftCard desmontado\nsin acción"]
    E -->|"Hace clic en Regenerate"| H["injectPrompt('Regenera el email para Ana García')\nagente genera nueva versión"]

    F --> I["Agente recibe el prompt inyectado"]
    I --> J["post_lead_comment(leadId, subject, body)\n→ notion_mcp.mcp_create_comment()\n→ Notion API: comment en la página"]
    J --> K(["✅ Comentario guardado en Notion\nagente confirma al usuario"])
```

---

## Generative UI — 3 Paradigmas

```mermaid
graph LR
    subgraph Controlled ["🎛️ Controlled — useComponent\nMás control · menos flexibilidad"]
        C1["Desarrollador define\ncomponentes React predefinidos"]
        C2["Agente elige cuál usar\ny rellena props"]
        C3["On-brand · pixel-perfect\nideal para workflows repetibles"]
        C1 --> C2 --> C3
    end

    subgraph Declarative ["📋 Declarative — A2UI\nBalance control/flexibilidad"]
        D1["Schema A2UI\nmapea outputs → renderers"]
        D2["Agente produce JSON\ndescribiendo el layout"]
        D3["A2UI renderiza\ncomponentes del catálogo"]
        D1 --> D2 --> D3
    end

    subgraph OpenEnded ["🌐 Open-ended — MCP Apps / openGenerativeUI\nMáxima flexibilidad"]
        O1["Agente genera HTML raw\no widget TSX"]
        O2["Sandbox doble-iframe\naisla el contenido"]
        O3["Disposable, data-grounded\ninterfaces on the fly"]
        O1 --> O2 --> O3
    end

    Controlled -->|"Lead cards\nen el canvas"| App["Esta App"]
    Declarative -->|"Componentes\nstreamed de Gemini"| App
    OpenEnded -->|"MCP server\nClaude / ChatGPT"| App
```

---

## MCP Server Desplegable

```mermaid
flowchart LR
    subgraph ExternalAgents ["Agentes Externos"]
        Claude["Claude Desktop\no claude.ai"]
        ChatGPT["ChatGPT\ncon MCP support"]
    end

    subgraph MCPServer ["apps/mcp/ — MCP Server (puerto 3011)"]
        ShowList["show-lead-list()\n→ widget tabla de leads"]
        ShowDemand["show-lead-demand()\n→ widget barras por workshop"]
        ShowPipeline["show-lead-pipeline()\n→ widget pipeline kanban"]
        ShowDashboard["show-canvas-dashboard()\n→ widget dashboard completo"]
        ShowEmailDraft["show-email-draft()\n→ widget HITL email"]
        PostComment["post-email-comment()\n→ comenta en Notion"]
    end

    subgraph Widgets ["Widgets TSX (resources/)"]
        W1["canvas-dashboard/widget.tsx"]
        W2["email-draft/widget.tsx"]
        W3["lead-demand/widget.tsx"]
        W4["lead-list/widget.tsx"]
        W5["lead-pipeline/widget.tsx"]
    end

    Claude & ChatGPT -->|"MCP tools"| MCPServer
    ShowList & ShowDemand & ShowPipeline & ShowDashboard --> W1 & W2 & W3 & W4 & W5
    ShowEmailDraft --> W2
    PostComment -->|"sin args requeridos"| Claude & ChatGPT
    W1 & W2 & W3 & W4 & W5 -->|"widget() response\nHTML renderizado"| ExternalAgents
```

---

## Stack Técnico

| Capa | Tecnología | Detalle |
|---|---|---|
| Frontend | Next.js 15 + React 19 + TypeScript | Tailwind CSS v4 · Radix UI · dnd-kit · Recharts |
| CopilotKit | `@copilotkit/react-core` v2 | CopilotSidebar · useFrontendTool · useAgent · A2UI |
| BFF | Hono (Node.js) + TypeScript | CopilotRuntime v2 + CopilotKitIntelligence + LangGraphAgent |
| Agent | Python 3.11+ + LangGraph | deepagents (default) · react-agent (alternativo) |
| LLM default | Gemini 3.1 Flash-Lite | `langchain-google-genai` |
| LLM alternativo | Claude Sonnet 4.6 | 1 env-var swap: `AGENT_RUNTIME=claude-sonnet-4-6-react` |
| Notion | `@notionhq/notion-mcp-server` vía `mcp-use` | spawned como subproceso npx |
| Intelligence | CopilotKit composite container | Postgres 16 · Redis 7 · threads persistentes |
| MCP server | `mcp-use/server` TypeScript | 6 tools · deployable a Manufact Cloud |
| Package mgmt | npm workspaces (frontend/bff/mcp) + uv (Python) | — |

---

## Estructura del Proyecto

```
Generative-UI-Global-Hackathon-Starter-Kit/
├── package.json                    # Root npm workspace
├── .env.example
├── scripts/
│   ├── check-env.sh                # Pre-flight: valida env vars
│   └── seed-default-user.sh        # Crea usuario por defecto en Postgres
├── deployment/
│   ├── docker-compose.yml          # Postgres + Redis + Intelligence
│   └── init-db/01-create-databases.sql
├── data/
│   └── notion-leads-sample/        # CSV + ZIP de leads de ejemplo
├── dev-docs/
│   ├── architecture.md             # Diagramas de arquitectura
│   ├── setup.md · model-switching.md · mcp-server.md
│   └── threads.md · customization.md · demo-prompts.md
│
└── apps/
    ├── frontend/                   # Next.js 15 — puerto 3010
    │   ├── next.config.ts          # Rewrites /api/copilotkit/* → BFF :4010
    │   └── src/
    │       ├── app/leads/page.tsx  # Página principal: canvas + chat + tools
    │       ├── components/
    │       │   ├── copilot/        # CopilotKitProviderShell · ToolFallbackCard
    │       │   ├── leads/          # PipelineBoard · LeadCard · QuickStats
    │       │   │                   # StatusDonut · WorkshopDemand
    │       │   ├── leads/inline/   # LeadMiniCard · EmailDraftCard (HITL)
    │       │   └── threads-drawer/ # Sidebar de hilos persistentes
    │       └── lib/leads/
    │           ├── types.ts        # Lead · AgentState · LeadFilter
    │           ├── optimistic.ts   # applyPatch / revertPatch
    │           └── derive.ts       # applyFilter · topWorkshop
    │
    ├── bff/                        # Hono BFF — puerto 4010
    │   └── src/server.ts           # CopilotRuntime v2 + LangGraphAgent
    │
    ├── agent/                      # Python LangGraph — puerto 8133
    │   ├── main.py                 # Entry point: build_graph · boot checks
    │   └── src/
    │       ├── runtime.py          # build_graph(): 4 runtimes
    │       ├── prompts.py          # Prompts del agente + integration status
    │       ├── lead_state.py       # LeadStateMiddleware: auto-hydrate
    │       ├── lead_store.py       # NotionStore | LocalJsonStore
    │       ├── notion_mcp.py       # mcp-use facade
    │       ├── notion_tools.py     # @tool definitions
    │       └── canvas.py           # Stubs del contrato de frontend tools
    │
    └── mcp/                        # MCP Server desplegable — puerto 3011
        ├── index.ts                # 6 tools con widget responses
        └── resources/              # Widget TSX por tool
```

---

## Instalación y Setup

### Prerrequisitos

- Node.js 18+ · npm · Python 3.11+ · uv (Python package manager) · Docker Desktop

### 1. Variables de entorno

```bash
cp .env.example .env
```

Variables mínimas requeridas:

| Variable | Descripción |
|---|---|
| `GOOGLE_API_KEY` | API key de Google Gemini (LLM default) |
| `ANTHROPIC_API_KEY` | API key de Anthropic Claude (opcional — si usas runtime claude) |
| `COPILOTKIT_CLOUD_PUBLIC_API_KEY` | API key de CopilotKit Intelligence |
| `NOTION_TOKEN` | Token de integración de Notion (opcional) |
| `NOTION_DATABASE_ID` | ID de la database de leads en Notion (opcional) |

### 2. Iniciar infraestructura

```bash
# Postgres + Redis + CopilotKit Intelligence
docker compose -f deployment/docker-compose.yml up -d

# Crear usuario por defecto
bash scripts/seed-default-user.sh
```

### 3. Instalar dependencias

```bash
# Frontend + BFF + MCP (npm workspaces)
npm install

# Agent (Python)
cd apps/agent
uv sync
```

### 4. Levantar los servicios

```bash
# Todo en paralelo (recomendado)
npm run dev

# O por separado:
npm run dev --workspace=apps/frontend   # :3010
npm run dev --workspace=apps/bff         # :4010
cd apps/agent && langgraph dev --port 8133
```

### 5. (Opcional) Levantar MCP Server

```bash
npm run dev --workspace=apps/mcp        # :3011
```

**Acceder a la app:** http://localhost:3010

---

## Puertos de Referencia

| Servicio | Puerto |
|---|---|
| Next.js frontend | 3010 |
| Hono BFF | 4010 |
| LangGraph agent | 8133 |
| MCP server (Manufact) | 3011 |
| Intelligence app-api | 4201 |
| Intelligence realtime-gateway | 4401 |
| PostgreSQL | 5436 (default) |
| Redis | 6382 (default) |

---

## Customización Rápida

| Quiero... | Archivo a editar |
|---|---|
| Cambiar el LLM | `.env` → `AGENT_RUNTIME=claude-sonnet-4-6-react` |
| Agregar un frontend tool | `apps/frontend/src/app/leads/page.tsx` → `useFrontendTool()` |
| Cambiar fuente de datos | `apps/agent/src/lead_store.py` → implementar `LeadStore` protocol |
| Agregar tool al agente | `apps/agent/src/notion_tools.py` → `@tool` decorator |
| Agregar tool al MCP server | `apps/mcp/index.ts` → nuevo `server.tool()` + widget en `resources/` |
| Personalizar el prompt | `apps/agent/src/prompts.py` → `LEAD_TRIAGE_PROMPT` |

---

## Fork vs. Upstream

Este fork es de `jerelvelarde/Generative-UI-Global-Hackathon-Starter-Kit` creado el 09/05/2026.

La app de ejemplo gestiona leads de un workshop usando Notion como backend y demuestra los 3 paradigmas de Generative UI. Para adaptarla a tu caso de uso, reemplaza la capa de Notion por cualquier otra fuente de datos vía MCP, y los componentes `Lead*` por tus propias entidades.

---

*Generative UI Global Hackathon: Agentic Interfaces · CopilotKit · 2026*
