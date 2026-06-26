export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number
    ) {
        super(message);
        this.name = "AppError";
    }
}

export const ERRORS = {
    USER_EXISTS: "El usuario ya está registrado.",
    INVALID_ROLE: "El rol es inválido."
} as const;