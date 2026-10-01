export async function uploadDocumentWithCleanup(
  storage: { upload: (path: string, file: File, options: { contentType: string; upsert: false }) => Promise<{ error: unknown }>;
    remove: (paths: string[]) => Promise<{ error: unknown }> },
  insertMetadata: () => Promise<void>, path: string, file: File
) {
  const uploaded = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (uploaded.error) throw uploaded.error;
  try { await insertMetadata(); }
  catch (error) {
    const cleanup = await storage.remove([path]);
    if (cleanup.error) throw new AggregateError([error, cleanup.error], "Upload metadata and cleanup failed");
    throw error;
  }
}
