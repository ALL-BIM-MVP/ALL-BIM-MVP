import type { ErrorFormat } from "./app-error.js";


export const INVITATION_ERRRORS = {
    
    INVITATION_INVALID: {
        statusCode: 410,
        response: { 
            code: "AUTH_INVALID_INVITATION", 
            message: "La invitación es inválida, expiró o ya fue utilizada." 
        } 
    },

} satisfies Record<string, ErrorFormat>;