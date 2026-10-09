import qrcode from "qrcode-generator";
// No requests or credentials: only the public invitation URL is encoded.
export function invitationQr(url: string) {
  const qr = qrcode(0, "M");
  qr.addData(url, "Byte");
  qr.make();
  return Array.from({ length: qr.getModuleCount() }, (_, y) =>
    Array.from({ length: qr.getModuleCount() }, (_, x) => qr.isDark(y, x)),
  );
}
