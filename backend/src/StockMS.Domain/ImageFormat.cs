namespace StockMS.Domain;
public static class ImageFormat
{
    public static string? Extension(ReadOnlySpan<byte> b) =>
        b.Length < 12                                                           ? null
        : b.StartsWith(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 })          ? ".png"
        : b.StartsWith(new byte[] { 255, 216, 255 })                            ? ".jpg"
        : b.StartsWith("RIFF"u8) && b.Slice(8, 4).SequenceEqual("WEBP"u8) ? ".webp"
                                                                                : null;
}
