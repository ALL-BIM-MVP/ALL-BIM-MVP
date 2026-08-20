import z from 'zod';
import { ProjectIdParamSchema } from './projects.schema.js';

export const ModuleCodeParamSchema = z.object({
    moduleCode: z.string().min(1),
});
export type ModuleCodeParam = z.infer<typeof ModuleCodeParamSchema>;

export const ProjectModuleCodeParamSchema = ProjectIdParamSchema.extend({
    moduleCode: z.string().min(1),
});
export type ProjectModuleCodeParam = z.infer<typeof ProjectModuleCodeParamSchema>;
