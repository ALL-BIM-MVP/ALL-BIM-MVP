// Suma exacta de NUMERIC(18,6) que llegan como texto desde pg ("12.500000", "-3.000000"): se
// pasa a enteros de millonésimas (BigInt) para no usar coma flotante y se devuelve con 6 decimales.
const SCALE = 1_000_000n;

const toMicro = (value: string): bigint => {
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = value.replace(/^[-+]/, "").split(".");
    const micro = BigInt(whole || "0") * SCALE + BigInt(fraction.padEnd(6, "0").slice(0, 6) || "0");
    return negative ? -micro : micro;
};

export const addNumeric = (a: string, b: string): string => {
    const total = toMicro(a) + toMicro(b);
    const negative = total < 0n;
    const abs = negative ? -total : total;
    return `${negative ? "-" : ""}${abs / SCALE}.${String(abs % SCALE).padStart(6, "0")}`;
};

export const negateNumeric = (a: string): string => addNumeric("0", `${a.startsWith("-") ? a.slice(1) : `-${a}`}`);
