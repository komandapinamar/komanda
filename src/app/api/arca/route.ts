import Afip from "@afipsdk/afip.js";

const afip = new Afip({
    CUIT: Number(process.env.AFIPSDK_CUIT || 20409378472),
    access_token: process.env.AFIPSDK_ACCESS_TOKEN || "" // Obtenido de https://app.afipsdk.com
});

export async function POST() {
    void afip;
    return Response.json({ ok: true });
}