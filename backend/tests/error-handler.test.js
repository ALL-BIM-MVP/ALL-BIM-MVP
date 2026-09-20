// error-handler.test.js
//
// Los errores de express.json() (JSON mal formado, cuerpo demasiado grande)
// son del cliente: responden 400/413 con un código claro, no un 500 opaco.
// Un error cualquiera sigue siendo 500 y un AppError conserva su status.
import { test } from "node:test";
import assert from "node:assert/strict";

import { errorHandler } from "../dist/middlewares/error.middleware.js";
import { AppError } from "../dist/models/errors/app-error.js";
import { COMMON_ERRORS } from "../dist/models/errors/common.errors.js";

const run = (err) => {
    const out = {};
    const res = { headersSent: false, status(code) { out.status = code; return this; }, json(body) { out.body = body; return this; } };
    errorHandler(err, { method: "POST", originalUrl: "/api/x" }, res, () => { out.next = true; });
    return out;
};

test("JSON mal formado: 400 INVALID_JSON_BODY (antes era un 500)", () => {
    const err = Object.assign(new SyntaxError("Expected property name"), { type: "entity.parse.failed", status: 400 });
    const out = run(err);
    assert.equal(out.status, 400);
    assert.equal(out.body.code, "INVALID_JSON_BODY");
});

test("cuerpo demasiado grande: 413 PAYLOAD_TOO_LARGE", () => {
    const out = run(Object.assign(new Error("too large"), { type: "entity.too.large", status: 413 }));
    assert.equal(out.status, 413);
    assert.equal(out.body.code, "PAYLOAD_TOO_LARGE");
});

test("un AppError conserva su status y un error desconocido sigue siendo 500", () => {
    const known = run(new AppError(COMMON_ERRORS.INVALID_ID_PARAM));
    assert.equal(known.status, 400);
    assert.equal(known.body.code, "INVALID_ID_PARAM");
    const unknown = run(new Error("algo inesperado"));
    assert.equal(unknown.status, 500);
    assert.equal(unknown.body.code, "INTERNAL_SERVER_ERROR");
});
