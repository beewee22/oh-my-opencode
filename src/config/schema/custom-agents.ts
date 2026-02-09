import { z } from "zod"

export const CustomAgentMetadataSchema = z.object({
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  toolRestrictions: z.record(z.string(), z.boolean()).optional(),
  displayName: z.string().optional(),
  role: z.string().optional(),
  callable: z.boolean().optional(),
  allowCallOmoAgent: z.boolean().optional(),
  isPlanAgent: z.boolean().optional(),
  isPrimaryAgent: z.boolean().optional(),
  injectEnvContext: z.boolean().optional(),
})

export const CustomAgentConfigSchema = z.object({
  model: z.string(),
  promptPath: z.string().optional(),
  constraintsPath: z.string().optional(),
  decisionsPath: z.string().optional(),
  knowledgePaths: z.array(z.string()).optional(),
  metadata: CustomAgentMetadataSchema.optional(),
})

export const DomainRestrictionSchema = z.object({
  domain: z.string(),
  ownerAgent: z.string(),
  restrictedTools: z.array(z.string()),
  description: z.string().optional(),
  allowedReadOps: z.array(z.string()).optional(),
  delegationTemplate: z.object({
    subagentType: z.string(),
    loadSkills: z.array(z.string()),
  }).optional(),
})

export type CustomAgentMetadata = z.infer<typeof CustomAgentMetadataSchema>
export type CustomAgentConfig = z.infer<typeof CustomAgentConfigSchema>
export type DomainRestriction = z.infer<typeof DomainRestrictionSchema>
