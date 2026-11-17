import { createDecipheriv, createHash } from "node:crypto";

import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  type PDFObject,
} from "pdf-lib";

// Descifrado de PDF protegidos solo con contraseña de propietario (se abren sin
// clave, pero no se pueden copiar o modificar), como las facturas electrónicas
// de ARCA. pdf-lib los carga pero no los descifra: al copiar sus páginas el
// contenido sale en blanco. Se implementa el manejador estándar (ISO 32000-1,
// 7.6.3) con contraseña de usuario vacía: RC4 de 40 a 128 bits (V1/V2) y
// AES-128 (V4/AESV2). AES-256 (V5, R5/R6) no se admite.

const RELLENO = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex",
);

function rc4(clave: Buffer, datos: Uint8Array) {
  const s = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + s[i] + clave[i % clave.length]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const salida = Buffer.alloc(datos.length);
  for (let k = 0, i = 0, j = 0; k < datos.length; k++) {
    i = (i + 1) & 0xff;
    j = (j + s[i]) & 0xff;
    [s[i], s[j]] = [s[j], s[i]];
    salida[k] = datos[k] ^ s[(s[i] + s[j]) & 0xff];
  }
  return salida;
}

function aes128(clave: Buffer, datos: Uint8Array) {
  if (datos.length < 32) return Buffer.alloc(0);
  const iv = Buffer.from(datos.subarray(0, 16));
  const decipher = createDecipheriv("aes-128-cbc", clave, iv);
  return Buffer.concat([decipher.update(Buffer.from(datos.subarray(16))), decipher.final()]);
}

function bytesDe(objeto: PDFObject | undefined) {
  if (objeto instanceof PDFString || objeto instanceof PDFHexString) return Buffer.from(objeto.asBytes());
  return null;
}

function numero(objeto: PDFObject | undefined, porDefecto: number) {
  return objeto instanceof PDFNumber ? objeto.asNumber() : porDefecto;
}

/** Devuelve el PDF descifrado, el mismo si no estaba cifrado, o null si no se puede descifrar. */
export async function descifrarPdf(contenido: Uint8Array): Promise<Uint8Array | null> {
  const doc = await PDFDocument.load(contenido, { ignoreEncryption: true });
  if (!doc.isEncrypted) return contenido;

  const contexto = doc.context;
  const refCifrado = contexto.trailerInfo.Encrypt;
  const cifrado = contexto.lookup(refCifrado);
  if (!(cifrado instanceof PDFDict)) return null;
  if (cifrado.get(PDFName.of("Filter"))?.toString() !== "/Standard") return null;

  const v = numero(cifrado.get(PDFName.of("V")), 0);
  const r = numero(cifrado.get(PDFName.of("R")), 2);
  const o = bytesDe(cifrado.get(PDFName.of("O")));
  const p = numero(cifrado.get(PDFName.of("P")), 0);
  const ids = contexto.trailerInfo.ID;
  const id0 = ids instanceof PDFArray ? bytesDe(ids.get(0)) : null;
  if (!o || !id0 || ![1, 2, 4].includes(v)) return null;

  let usaAes = false;
  let largo = v === 1 ? 5 : numero(cifrado.get(PDFName.of("Length")), 40) / 8;
  let cifraMetadatos = true;
  if (v === 4) {
    const filtros = cifrado.lookup(PDFName.of("CF"));
    const std = filtros instanceof PDFDict ? filtros.lookup(PDFName.of("StdCF")) : null;
    const cfm = std instanceof PDFDict ? std.get(PDFName.of("CFM"))?.toString() : null;
    if (cfm === "/AESV2") usaAes = true;
    else if (cfm !== "/V2") return null;
    largo = 16;
    cifraMetadatos = cifrado.get(PDFName.of("EncryptMetadata"))?.toString() !== "false";
  }

  // Algoritmo 2: clave del archivo a partir de la contraseña de usuario vacía.
  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(p);
  let hash = createHash("md5")
    .update(RELLENO)
    .update(o)
    .update(pBytes)
    .update(id0)
    .update(r >= 4 && !cifraMetadatos ? Buffer.from([0xff, 0xff, 0xff, 0xff]) : Buffer.alloc(0))
    .digest();
  if (r >= 3) {
    for (let i = 0; i < 50; i++) hash = createHash("md5").update(hash.subarray(0, largo)).digest();
  }
  const claveArchivo = hash.subarray(0, largo);

  const claveObjeto = (ref: PDFRef) => {
    const extra = Buffer.from([
      ref.objectNumber & 0xff,
      (ref.objectNumber >> 8) & 0xff,
      (ref.objectNumber >> 16) & 0xff,
      ref.generationNumber & 0xff,
      (ref.generationNumber >> 8) & 0xff,
    ]);
    const h = createHash("md5")
      .update(claveArchivo)
      .update(extra)
      .update(usaAes ? Buffer.from("sAlT") : Buffer.alloc(0))
      .digest();
    return h.subarray(0, Math.min(largo + 5, 16));
  };
  const descifrar = (clave: Buffer, datos: Uint8Array) => (usaAes ? aes128(clave, datos) : rc4(clave, datos));

  // Cadenas dentro de diccionarios y arreglos (los streams se tratan aparte).
  const descifrarValor = (valor: PDFObject, clave: Buffer): PDFObject => {
    const bytes = bytesDe(valor);
    if (bytes) return PDFHexString.of(descifrar(clave, bytes).toString("hex"));
    if (valor instanceof PDFDict) {
      for (const [k, v2] of valor.entries()) valor.set(k, descifrarValor(v2, clave));
    } else if (valor instanceof PDFArray) {
      for (let i = 0; i < valor.size(); i++) valor.set(i, descifrarValor(valor.get(i), clave));
    }
    return valor;
  };

  for (const [ref, objeto] of contexto.enumerateIndirectObjects()) {
    if (refCifrado instanceof PDFRef && ref === refCifrado) continue;
    const clave = claveObjeto(ref);
    if (objeto instanceof PDFRawStream) {
      const tipo = objeto.dict.get(PDFName.of("Type"))?.toString();
      if (tipo === "/XRef") continue; // los streams de referencias cruzadas no se cifran
      if (tipo === "/Metadata" && !cifraMetadatos) continue;
      descifrarValor(objeto.dict, clave);
      (objeto as unknown as { contents: Uint8Array }).contents = descifrar(clave, objeto.contents);
    } else {
      contexto.assign(ref, descifrarValor(objeto, clave));
    }
  }

  delete contexto.trailerInfo.Encrypt;
  if (refCifrado instanceof PDFRef) contexto.delete(refCifrado);
  return doc.save({ useObjectStreams: false });
}
