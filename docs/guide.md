# Operator guide / Hagaha isticmaalka

## Ku bilow kayd madhan

1. **Dejinta → Goobta shaqada:** qor magaca shirkadda, cinwaanka iyo astaanta. Dookhyada ka dooro lacagta, luqadda, aagga waqtiga iyo xadka kaydka yar. Waqtiga asalka ahi waa `Africa/Mogadishu`.
2. **Qaybaha → Ku dar qayb**, kadib **Alaabta → Ku dar alaab**. SKU-gu waa gaar; qiimaha iibku kama yaraan karo eber. Alaab cusub waxay ku bilaabataa kayd eber ah.
3. **Kaydka soo galay → Geli kayd:** dooro alaabta iyo tirada. Hal rasiidh ayuu geli karaa dhowr nooc oo alaab ah. Haddii hal saf khaldan yahay, rasiidhka oo dhan waa la diidayaa.
4. **Macaamiisha:** ku dar macmiilka diiwaangashan. Iib lacag ah uma baahna koonto macmiil.
5. **Kaydka baxay:** dooro Dalab macmiil, Iib lacag ah, Muunad ama Hadiyad. Dalab iyo iib lacag ah oo halkan laga sameeyo isla markiiba waa la xaqiijiyaa. Muunad/hadiyad waxay u baahan yihiin qaate iyo sabab.
6. **Dalabaadka:** dalab cusub waa Pending. Qoondeyntu waxay yaraysaa kaydka la heli karo, laakiin kama jarto kaydka yaalla. Xaqiijintu hal mar ayay kaydka ka jartaa. Delivered lama joojin karo; isticmaal soo celin.
7. **Soo celinta:** dooro dalabkii asalka ahaa, safka alaabta, tirada iyo xaaladda. Ansixi kaddib hubinta. Good → kayd ayaa lagu daraa; Damaged → diiwaan keliya. Isla xabbad laba jeer lama celin karo.
8. **Sixitaanka:** geli tirada dhab ahaan la tiriyay iyo sabab. Lama sixi karo hoos inta la qoondeeyay.
9. **Warbixinnada:** dooro warbixin, xaddid taariikhda, kadib Print ama Export PDF. Beddelka luqadda ee header-ku wuxuu beddelaa luqadda PDF-ka.
10. **Amniga:** kaydi furaha soo kabashada meel ammaan ah. Samee nuqul kayd ah, xaqiiji oo soo dejiso. Ha isku dayin restore xogta shaqada adigoon tijaabin nuqul gooni ah.

## A worked stock check

| Action | On hand | Reserved | Available |
|---|---:|---:|---:|
| Receive 12 units | 12 | 0 | 12 |
| Create a Pending order for 4 | 12 | 4 | 8 |
| Confirm it | 8 | 0 | 8 |
| Deliver it | 8 | 0 | 8 |
| Approve a return of 1 Good and 1 Damaged | 9 | 0 | 9 |
| Adjust physical count to 10 with a reason | 10 | 0 | 10 |

Check **Settings → Security → Ledger integrity**. Reversal is a new movement, not an erasure. A receipt cannot be reversed if its stock was sold or reserved. A confirmed order with an outstanding or approved return cannot also be cancelled. Rejecting a pending return releases its return allowance.

Click a row's arrow to inspect, edit, archive, confirm, reverse, print or export as appropriate. Product images and company logos must be JPEG, PNG or WebP, at most 2 MB. The dashboard does not invent activity when a warehouse is empty.
