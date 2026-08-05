export async function downloadImage(url: string, filename: string) {
  try {
    const { downloadProxy } = await import('@/server/fns/files');
    const response = await downloadProxy({ data: { url } });
    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    console.error('Download failed:', error);
  }
}
