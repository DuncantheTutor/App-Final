declare module "qrcode" {
  export function create(
    data: string,
    options?: { errorCorrectionLevel?: "L" | "M" | "Q" | "H" }
  ): {
    modules: { size: number; data: ArrayLike<number> };
  };
}
