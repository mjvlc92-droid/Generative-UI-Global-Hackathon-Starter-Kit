import { MCPServer, text, widget } from "mcp-use/server";
import { z } from "zod";
import {
  leadSchema,
  segmentSchema,
  type Lead,
  type Segment,
} from "./src/lib/leads/types";
import { topWorkshop } from "./src/lib/leads/derive";
import { SAMPLE_LEADS, SAMPLE_SEGMENTS } from "./src/lib/leads/sample";

const server = new MCPServer({
  name: "hackathon-mcp",
  title: "hackathon-mcp",
  version: "1.0.0",
  description:
    "Workshop Lead Triage — visual MCP widgets for the Notion-sourced workshop leads canvas: list, demand, pipeline, dashboard (stats + donut + bars), and a HITL email-draft card.",
  baseUrl: process.env.MCP_URL || "http://localhost:3011",
  favicon: "favicon.ico",
  websiteUrl: "https://mcp-use.com",
  icons: [
    {
      src: "icon.svg",
      mimeType: "image/svg+xml",
      sizes: ["512x512"],
    },
  ],
});

// Shared input schema. All three tools accept an optional `leads` array (and
// `segments`, where applicable). When omitted or empty, the widget falls back
// to the sample dataset baked into `src/lib/leads/sample.ts` so the views can
// be demoed inside ChatGPT/Claude without a backing fetch.
const leadsInput = z.object({
  leads: z
    .array(leadSchema)
    .default([])
    .describe(
      "Lead rows. Omit or pass an empty array to render with the sample dataset.",
    ),
  segments: z
    .array(segmentSchema)
    .default([])
    .describe("Optional segments for colored dots."),
});

function pickLeads(input: { leads: Lead[] }): Lead[] {
  return input.leads.length ? input.leads : SAMPLE_LEADS;
}

function pickSegments(input: { segments: Segment[] }): Segment[] {
  return input.segments.length ? input.segments : SAMPLE_SEGMENTS;
}

function summarize(leads: Lead[], view: string): string {
  const top = topWorkshop(leads);
  const tail = top ? ` Top demand: ${top}.` : "";
  return `Rendered the ${view} view for ${leads.length} leads.${tail}`;
}

server.tool(
  {
    name: "show-lead-list",
    description:
      "Render the workshop lead triage *list* view (KPI tiles + table of leads).",
    schema: leadsInput,
    widget: {
      name: "lead-list",
      invoking: "Loading leads…",
      invoked: "List ready",
    },
  },
  async (input) => {
    const leads = pickLeads(input);
    const segments = pickSegments(input);
    return widget({
      props: { leads, segments },
      output: text(summarize(leads, "list")),
    });
  },
);

server.tool(
  {
    name: "show-lead-demand",
    description:
      "Render the workshop lead triage *demand* view (workshop bars, technical-level donut, tool usage).",
    schema: leadsInput.pick({ leads: true }),
    widget: {
      name: "lead-demand",
      invoking: "Aggregating leads…",
      invoked: "Demand ready",
    },
  },
  async (input) => {
    const leads = pickLeads(input);
    return widget({
      props: { leads },
      output: text(summarize(leads, "demand")),
    });
  },
);

server.tool(
  {
    name: "show-lead-pipeline",
    description:
      "Render the workshop lead triage *pipeline* view (kanban columns by status, read-only).",
    schema: leadsInput,
    widget: {
      name: "lead-pipeline",
      invoking: "Loading pipeline…",
      invoked: "Pipeline ready",
    },
  },
  async (input) => {
    const leads = pickLeads(input);
    const segments = pickSegments(input);
    return widget({
      props: { leads, segments },
      output: text(summarize(leads, "pipeline")),
    });
  },
);

server.tool(
  {
    name: "show-canvas-dashboard",
    description:
      "Render the Workshop Lead Triage canvas dashboard: 4 quick-stat tiles + status donut + workshop-demand bars. Mirrors the layout above the kanban in the Next.js canvas.",
    schema: leadsInput.pick({ leads: true }),
    widget: {
      name: "canvas-dashboard",
      invoking: "Aggregating leads…",
      invoked: "Dashboard ready",
    },
  },
  async (input) => {
    const leads = pickLeads(input);
    return widget({
      props: { leads },
      output: text(summarize(leads, "dashboard")),
    });
  },
);

// Sample draft used when the inspector calls show-email-draft with no
// arguments. Mirrors the SAMPLE_LEADS fallback the other widgets use so the
// widget renders cleanly out of the box.
const SAMPLE_DRAFT = {
  leadId: "sample-ada-lovelace",
  leadName: "Ada Lovelace",
  leadEmail: "ada.lovelace@example.com",
  leadCompany: "Mango Labs",
  leadRole: "Founder",
  subject: "Following up on your Agentic UI workshop interest",
  body:
    "Hi Ada,\n\n" +
    "Thanks for signing up for the Agentic UI (AG-UI) workshop — your background at Mango Labs is exactly the profile we're building the curriculum for.\n\n" +
    "A quick question before we lock the date: are there one or two specific patterns (state sync, tool gating, HITL) you're hoping we cover?\n\n" +
    "Best,\nWorkshop team",
};

server.tool(
  {
    name: "show-email-draft",
    description:
      "Render a human-in-the-loop email draft for a single lead. Subject and body are editable in place; clicking Send calls post-email-comment to persist the message as a Notion comment. Defaults to a sample draft when called with no arguments.",
    schema: z.object({
      leadId: z
        .string()
        .default(SAMPLE_DRAFT.leadId)
        .describe("Notion page id of the lead to email."),
      leadName: z.string().default(SAMPLE_DRAFT.leadName).optional(),
      leadEmail: z.string().default(SAMPLE_DRAFT.leadEmail).optional(),
      leadCompany: z.string().default(SAMPLE_DRAFT.leadCompany).optional(),
      leadRole: z.string().default(SAMPLE_DRAFT.leadRole).optional(),
      subject: z
        .string()
        .default(SAMPLE_DRAFT.subject)
        .describe("Initial subject line — user may edit before sending."),
      body: z
        .string()
        .default(SAMPLE_DRAFT.body)
        .describe("Initial email body — user may edit before sending."),
    }),
    widget: {
      name: "email-draft",
      invoking: "Drafting email…",
      invoked: "Draft ready",
    },
  },
  async (input) => {
    const props = {
      ...SAMPLE_DRAFT,
      ...input,
    };
    return widget({
      props,
      output: text(
        `Drafted an email to ${props.leadName ?? props.leadEmail ?? props.leadId}: ${props.subject}`,
      ),
    });
  },
);

server.tool(
  {
    name: "post-email-comment",
    description:
      "Post an APPROVED email draft as a comment on the lead's Notion page. Called by the email-draft widget when the user clicks Send. Returns a confirmation message. Defaults to the sample draft when called with no arguments.",
    schema: z.object({
      leadId: z
        .string()
        .default(SAMPLE_DRAFT.leadId)
        .describe("Notion page id of the lead."),
      subject: z
        .string()
        .default(SAMPLE_DRAFT.subject)
        .describe("Final subject line, after the user's edits."),
      body: z
        .string()
        .default(SAMPLE_DRAFT.body)
        .describe("Final email body, after the user's edits."),
    }),
  },
  async ({ leadId, subject, body: _body }) => {
    // Mock-only in this MCP demo. The same shape ships in the Next.js
    // canvas's post_lead_comment LangChain tool, which posts to Notion via
    // @notionhq/notion-mcp-server. Wire that server here when running
    // against a live workspace.
    return text(
      `Posted email comment on lead ${leadId}: "${subject}"`,
    );
  },
);

server.listen().then(() => {
  console.log("MCP server running on port 3011");
});
