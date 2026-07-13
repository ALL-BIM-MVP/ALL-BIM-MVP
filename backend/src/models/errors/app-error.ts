
interface ErrorResponse {
    code: string;
    message: string;
}

export interface ErrorFormat {
    statusCode: number;
    response: ErrorResponse;
}

export class AppError extends Error {

    public statusCode: number;
    public response: ErrorResponse;

    constructor(options: ErrorFormat) {
        super(options.response.message);

        this.name = "AppError";
        this.statusCode = options.statusCode;
        this.response = options.response;
    }
}