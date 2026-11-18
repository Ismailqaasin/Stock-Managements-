using Xunit;
using StockMS.Application;
using StockMS.Domain;
namespace StockMS.Tests;
public class ContractTests {
 [Fact] public void RefusesWeakPassword()=>Assert.False(new PasswordValidator().Validate(new PasswordRequest(null,"short",null)).IsValid);
 [Fact] public void ReportSetHasThirteenTypes()=>Assert.Equal(13,ReportCatalog.Types.Count);
 [Fact] public void ImageUploadRejectsText()=>Assert.Null(ImageFormat.Extension("not an image file"u8));
 [Fact] public void ImageChecksSignature()=>Assert.Equal(".webp",ImageFormat.Extension("RIFF0000WEBP"u8));
}
