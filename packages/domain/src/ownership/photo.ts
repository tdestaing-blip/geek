/** Owner-private media depicting one canonical physical Copy. */
export type CopyPhoto = {
  readonly id: string;
  readonly copyId: string;
  readonly storagePath: string;
  readonly sortOrder: number;
  readonly mimeType: "image/jpeg";
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly createdAt: string;
};
