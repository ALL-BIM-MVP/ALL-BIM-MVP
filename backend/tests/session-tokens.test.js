// session-tokens.test.js
//
// Dos inicios de sesión del mismo usuario en el mismo segundo (dos pestañas, o un script que entra dos veces)
// producían el MISMO refresh token y el segundo fallaba con 500 (token_hash único). Ahora cada token es distinto.
//
// Correr: npm test   (desde backend/)
import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import pool from "../dist/db/database.js";
import { createSession } from "../dist/services/session.service.js";
import { verifyRefreshToken } from "../dist/utils/jwt.js";
import { hashToken } from "../dist/utils/hashing.js";

test("dos sesiones seguidas del mismo usuario generan tokens distintos y las dos se guardan", async () => {
    const user = (await pool.query(`SELECT user_id, role_id, email FROM users ORDER BY user_id LIMIT 1`)).rows[0];
    const payload = { user_id: user.user_id, role_id: user.role_id, email: user.email };
    const [a, b] = await Promise.all([createSession(payload), createSession(payload)]);
    assert.notEqual(a.refresh_token, b.refresh_token);
    assert.equal(verifyRefreshToken(a.refresh_token).user_id, user.user_id, "el token sigue verificándose igual");
    await pool.query(`DELETE FROM refresh_tokens WHERE token_hash = ANY($1::text[])`, [[a, b].map((t) => hashToken(t.refresh_token))]);
    await pool.end();
});
