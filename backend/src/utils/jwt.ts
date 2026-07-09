import jwt, {type SignOptions} from "jsonwebtoken";
import type { AuthPayload, DecodedToken } from "../models/auth.models.js";
import ms, { type StringValue } from 'ms';
import { AppError, ERRORS } from "../models/error.models.js";
if (!process.env.JWT_SECRET) {
    throw new Error("ERROR: variable 'JWT_SECRET' no definida.");
}
if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error("ERROR: variable 'JWT_REFRESH_SECRET' no definida.");
}

const JWT_SECRET : string = process.env.JWT_SECRET;
const JWT_EXPIRES_IN : SignOptions["expiresIn"] = 
    (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) || "15m";

const JWT_REFRESH_SECRET : string = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRES_IN : SignOptions["expiresIn"] = 
    (process.env.JWT_REFRESH_EXPIRES_IN as SignOptions["expiresIn"]) || "7d";


export const getRefreshTokenExpiresAt = (): Date => {
    const durationInMs = ms(JWT_REFRESH_EXPIRES_IN as StringValue);
    return new Date(Date.now() + durationInMs);
};

export const generateAccessToken = (payload : AuthPayload) : string => {
    return jwt.sign(payload, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN});
};

export const generateRefreshToken = (payload : AuthPayload) : string => {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {expiresIn: JWT_REFRESH_EXPIRES_IN});
};

export const verifyAccessToken = (token : string) : DecodedToken => {
    return verifyToken(token, JWT_SECRET, 'access');
}

export const verifyRefreshToken = (token : string) : DecodedToken => {
    return verifyToken(token, JWT_REFRESH_SECRET, 'refresh');
}

const verifyToken = (token : string, secretKey : string | Buffer, tokenType : 'refresh' | 'access') : DecodedToken => {
    try {
        const decoded = jwt.verify(token, secretKey);

        if(typeof decoded === "string"){
            const err = (tokenType === 'access') ? ERRORS.TOKEN_ACCESS_INVALID : ERRORS.TOKEN_REFRESH_INVALID;
            throw new AppError(err);
        }

        return decoded as DecodedToken;


    } catch(error){

        if(error instanceof AppError){
            throw error;
        }

        if(error instanceof jwt.TokenExpiredError){
            const err = (tokenType === 'access') ? ERRORS.TOKEN_ACCESS_EXPIRED : ERRORS.TOKEN_REFRESH_EXPIRED;
            throw new AppError(err);
        }

        const err = (tokenType === 'access') ? ERRORS.TOKEN_ACCESS_INVALID : ERRORS.TOKEN_REFRESH_INVALID;
        throw new AppError(err);
    }
}