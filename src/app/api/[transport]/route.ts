/**
 * @file route.ts
 * MCP server for PromptEnhancer, served from the same Vercel deployment.
 *
 * The dynamic [transport] segment exposes:
 *   - /api/mcp  → Streamable HTTP (give this URL to Langdock / MCP clients)
 *   - /api/sse  → legacy SSE fallback
 *
 * Four tools wrap the shared service layer in src/lib/services.ts (the same code
 * the REST routes use): enhance_prompt, generate_prompts, revise_prompt, reformat_prompt.
 *
 * No auth (per project decision): abuse is bounded by the per-IP rate limit below
 * plus the OpenRouter account spend cap.
 */

import { createMcpHandler } from 'mcp-handler'
import { z } from 'zod'
import { toApiErrorResponse } from '@/lib/openrouter'
import { rateLimit } from '@/lib/rate-limit'
import {
  runEnhance,
  runGenerate,
  runRevise,
  runReformat,
} from '@/lib/services'

export const maxDuration = 300

// --- shared zod fragments ----------------------------------------------------

const TARGET_MODELS = [
  'nanobanana-2',
  'flux-2-klein-9b',
  'veo-3-1',
  'kling-v3',
  'kling-o3',
  'ltxv-2-3',
  'seedance',
] as const

const GENERATION_MODES = ['generate', 'edit', 'video'] as const

const imageSchema = z.union([
  z.object({
    type: z.literal('url'),
    url: z.string().url().describe('Publicly reachable image URL (preferred for MCP).'),
  }),
  z.object({
    type: z.literal('base64'),
    data: z.string().describe('Base64-encoded image data (no data: prefix).'),
    mimeType: z.string().describe('e.g. image/png, image/jpeg'),
  }),
])

// --- helpers -----------------------------------------------------------------

/** Best-effort client IP from the MCP request, for per-IP rate limiting. */
function ipFromExtra(extra: unknown): string {
  const headers = (extra as { requestInfo?: { headers?: Record<string, string | string[] | undefined> } })
    ?.requestInfo?.headers
  const xff = headers?.['x-forwarded-for']
  const raw = Array.isArray(xff) ? xff[0] : xff
  return raw?.split(',')[0]?.trim() || 'mcp'
}

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: boolean }

function ok(payload: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
}

function fail(message: string): ToolResult {
  return { content: [{ type: 'text', text: message }], isError: true }
}

/** Runs a tool body with shared rate-limiting + error mapping. */
async function guard<T>(extra: unknown, run: () => Promise<T>): Promise<ToolResult> {
  if (!rateLimit(ipFromExtra(extra)).success) {
    return fail('Too many requests. Please wait a moment and try again.')
  }
  try {
    return ok(await run())
  } catch (error) {
    return fail(toApiErrorResponse(error).error)
  }
}

// --- handler -----------------------------------------------------------------

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      'enhance_prompt',
      {
        title: 'Enhance prompt',
        description:
          'Optimize an existing prompt for a specific AI image/video model. Restructures, expands, and adapts the prompt to the target model\'s strengths and syntax. Optionally accepts reference images whose visual style is extracted first.',
        inputSchema: {
          prompt: z.string().min(1).describe('The raw prompt to optimize.'),
          targetModel: z.enum(TARGET_MODELS).default('flux-2-klein-9b').describe('The model the prompt is being written for.'),
          mode: z.enum(GENERATION_MODES).default('generate').describe('generate (text-to-image), edit (image-to-image), or video.'),
          images: z.array(imageSchema).max(6).optional().describe('Optional reference images (max 6) used as a style guide.'),
        },
      },
      async (args, extra) => guard(extra, () => runEnhance({
        prompt: args.prompt,
        targetModel: args.targetModel,
        mode: args.mode,
        images: args.images,
      })),
    )

    server.registerTool(
      'generate_prompts',
      {
        title: 'Generate prompts',
        description:
          'Full pipeline: analyze reference images, build a creative brief, and derive model-specific prompts. Provide a concept description and/or reference images. Set briefOnly=true for Art Direction (returns the creative brief without final prompts).',
        inputSchema: {
          description: z.string().default('').describe('Freeform description of the concept to produce.'),
          images: z.array(imageSchema).max(6).optional().describe('Optional reference images (max 6). Required for edit mode.'),
          promptCount: z.number().int().min(1).max(6).default(3).describe('How many diverse prompts to generate (1-6).'),
          targetModel: z.enum(TARGET_MODELS).default('flux-2-klein-9b'),
          mode: z.enum(GENERATION_MODES).default('generate'),
          briefOnly: z.boolean().default(false).describe('Return only the creative brief (Art Direction), skipping prompt derivation.'),
        },
      },
      async (args, extra) => guard(extra, () => runGenerate({
        userInputs: { description: args.description },
        images: args.images ?? [],
        promptCount: args.promptCount,
        targetModel: args.targetModel,
        mode: args.mode,
        briefOnly: args.briefOnly,
      })),
    )

    server.registerTool(
      'revise_prompt',
      {
        title: 'Revise prompt',
        description:
          'Refine a single generated prompt using a plain-English instruction and/or a fix category. Returns the revised prompt text.',
        inputSchema: {
          prompt: z.string().min(1).describe('The prompt to revise.'),
          label: z.string().default('').describe('Optional shot label for context.'),
          revisionNote: z.string().default('').describe('Plain-English instruction for the change. Required unless fixCategory is given.'),
          fixCategory: z.string().optional().describe('Optional fix preset id: hands, lighting, composition, too-ai, mood, scale, text, sharpen, longer, shorter.'),
          description: z.string().default('').describe('Optional original concept description for context.'),
          targetModel: z.enum(TARGET_MODELS).default('flux-2-klein-9b'),
          mode: z.enum(GENERATION_MODES).default('generate'),
        },
      },
      async (args, extra) => guard(extra, () => runRevise({
        prompt: args.prompt,
        label: args.label,
        revisionNote: args.revisionNote,
        fixCategory: args.fixCategory,
        userInputs: { description: args.description },
        targetModel: args.targetModel,
        mode: args.mode,
      })),
    )

    server.registerTool(
      'reformat_prompt',
      {
        title: 'Reformat prompt',
        description:
          'Rewrite a prompt written for one model into another model\'s format, preserving the same scene, subject, lighting, and mood while adapting syntax and length.',
        inputSchema: {
          prompt: z.string().min(1).describe('The prompt to reformat.'),
          label: z.string().default('').describe('Optional shot label for context.'),
          fromModel: z.enum(TARGET_MODELS).describe('The model the prompt was written for.'),
          toModel: z.enum(TARGET_MODELS).describe('The model to rewrite the prompt for (must differ from fromModel).'),
        },
      },
      async (args, extra) => guard(extra, () => runReformat({
        prompt: args.prompt,
        label: args.label,
        fromModel: args.fromModel,
        toModel: args.toModel,
      })),
    )
  },
  {},
  { basePath: '/api' },
)

export { handler as GET, handler as POST, handler as DELETE }
