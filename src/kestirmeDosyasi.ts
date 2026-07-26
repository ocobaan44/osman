/**
 * iOS Kısayollar için .shortcut dosyası (imzasız plist) üretir.
 *
 * Elle kurulum kırılgan: kullanıcı "URL Kodla" aksiyonunu bulmak, girdisini
 * Kestirme Girdisi yapmak ve metin alanına değişken gömmek zorunda kalıyor.
 * Dosya olarak verince tek dokunuşa iniyor.
 *
 * Apple iOS 15'ten beri imzasız kestirmeleri varsayılan olarak reddediyor;
 * kullanıcının Ayarlar → Kısayollar → "Güvenilmeyen Kısayollara İzin Ver"
 * seçeneğini açması gerekiyor (o anahtar da ancak en az bir kestirme
 * çalıştırıldıktan sonra beliriyor). İmzalamak için gerçek bir cihaz gerektiğinden
 * sunucu tarafında yapılabilecek bir şey yok.
 *
 * Aksiyonlar:
 *   1. URL İçeriğini Al  — adres + Kestirme Girdisi
 *   2. Fotoğraf Albümüne Kaydet
 */

/** Kestirmelerde değişkenin metin içindeki yerini tutan yer tutucu (U+FFFC). */
const NESNE_YER_TUTUCU = "￼";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param indirUrl `https://host/indir?t=TOKEN&url=` — sonu url= ile bitmeli;
 *                 Kestirme Girdisi tam buraya eklenir.
 */
export function kestirmePlist(indirUrl: string): string {
  const metin = `${indirUrl}${NESNE_YER_TUTUCU}`;
  // Aralık UTF-16 birimi cinsinden; yer tutucudan önceki kısım ASCII olduğu için
  // indexOf doğrudan doğru uzaklığı verir.
  const uzaklik = metin.indexOf(NESNE_YER_TUTUCU);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>WFWorkflowClientVersion</key>
\t<string>1146.7</string>
\t<key>WFWorkflowMinimumClientVersion</key>
\t<integer>900</integer>
\t<key>WFWorkflowMinimumClientVersionString</key>
\t<string>900</string>
\t<key>WFWorkflowIcon</key>
\t<dict>
\t\t<key>WFWorkflowIconStartColor</key>
\t\t<integer>463140863</integer>
\t\t<key>WFWorkflowIconGlyphNumber</key>
\t\t<integer>59511</integer>
\t</dict>
\t<key>WFWorkflowTypes</key>
\t<array>
\t\t<string>ActionExtension</string>
\t</array>
\t<key>WFWorkflowInputContentItemClasses</key>
\t<array>
\t\t<string>WFURLContentItem</string>
\t\t<string>WFStringContentItem</string>
\t</array>
\t<key>WFWorkflowHasShortcutInputVariables</key>
\t<true/>
\t<key>WFWorkflowImportQuestions</key>
\t<array/>
\t<key>WFQuickActionSurfaces</key>
\t<array/>
\t<key>WFWorkflowActions</key>
\t<array>
\t\t<dict>
\t\t\t<key>WFWorkflowActionIdentifier</key>
\t\t\t<string>is.workflow.actions.downloadurl</string>
\t\t\t<key>WFWorkflowActionParameters</key>
\t\t\t<dict>
\t\t\t\t<key>WFHTTPMethod</key>
\t\t\t\t<string>GET</string>
\t\t\t\t<key>WFURL</key>
\t\t\t\t<dict>
\t\t\t\t\t<key>WFSerializationType</key>
\t\t\t\t\t<string>WFTextTokenString</string>
\t\t\t\t\t<key>Value</key>
\t\t\t\t\t<dict>
\t\t\t\t\t\t<key>string</key>
\t\t\t\t\t\t<string>${xmlEscape(metin)}</string>
\t\t\t\t\t\t<key>attachmentsByRange</key>
\t\t\t\t\t\t<dict>
\t\t\t\t\t\t\t<key>{${uzaklik}, 1}</key>
\t\t\t\t\t\t\t<dict>
\t\t\t\t\t\t\t\t<key>Type</key>
\t\t\t\t\t\t\t\t<string>ExtensionInput</string>
\t\t\t\t\t\t\t</dict>
\t\t\t\t\t\t</dict>
\t\t\t\t\t</dict>
\t\t\t\t</dict>
\t\t\t</dict>
\t\t</dict>
\t\t<dict>
\t\t\t<key>WFWorkflowActionIdentifier</key>
\t\t\t<string>is.workflow.actions.savetocameraroll</string>
\t\t\t<key>WFWorkflowActionParameters</key>
\t\t\t<dict/>
\t\t</dict>
\t</array>
</dict>
</plist>
`;
}
