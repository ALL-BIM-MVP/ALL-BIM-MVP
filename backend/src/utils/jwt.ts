import jwt, {type SignOptions} from "jsonwebtoken";
import type { AuthPayload, DecodedToken } from "../models/auth.models.js";

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


export const generateAccessToken = (payload : AuthPayload) : string => {
    return jwt.sign(payload, JWT_SECRET, {expiresIn: JWT_EXPIRES_IN});
};

export const generateRefreshToken = (payload : AuthPayload) : string => {
    return jwt.sign(payload, JWT_REFRESH_SECRET, {expiresIn: JWT_REFRESH_EXPIRES_IN});
};

export const verifyAccessToken = (token : string) : DecodedToken | null => {
    return verifyToken(token, JWT_SECRET);
}

export const verifyRefreshToken = (token : string) : DecodedToken | null => {
    return verifyToken(token, JWT_REFRESH_SECRET);
}

const verifyToken = (token : string, secretKey : string | Buffer) : DecodedToken | null => {
    try {
        const decoded = jwt.verify(token, secretKey);
        
        if (typeof decoded === "string") return null;
        return decoded as DecodedToken;
    }catch {
        return null
    }
}