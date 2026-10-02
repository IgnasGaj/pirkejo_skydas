# F1–F4 sutvirtinimo perėmimo įrašas — 2026-10-02

Naudotojas patvirtino, kad rankiniu būdu patikrino programą ir ji veikia. Šis patvirtinimas nereiškia, kad atskirai išbandyti visi „iPhone“ / „Safari“, „Android“ kameros, pasuktų nuotraukų ar vaizdinio išdėstymo scenarijai. Šie tikrų įrenginių patikrinimai lieka atviri.

## Duomenų bazės migracijos

Prieš naudojant pirkinių saugyklos ir čekio įkėlimo funkcijas bet kurioje aplinkoje, joje turi būti pritaikytos `supabase/migrations/20261001000000_purchase_vault.sql` ir `supabase/migrations/20261002000000_receipt_upload_claims.sql` migracijos. Antroji įdiegia čekio įkėlimo rezervavimo funkciją `claim_reviewed_receipt`. Vienkartinėje vietinėje ir CI duomenų bazėje abi migracijos pritaikytos sėkmingai. Gamybinės duomenų bazės migracijų būklė nebuvo tikrinta; gamybinėje aplinkoje migracijos nebuvo vykdomos.

## Atskiras priklausomybių tvarkymo darbas

`npm ci` auditas nurodo du radinius: vidutinio sunkumo „Next“ ir aukšto sunkumo vidinės „PostCSS“ priklausomybės. Tai atskiras priklausomybių atnaujinimo darbas, aprašytas [prieš Sprint 5 atliktoje kodo patikroje](./pre-sprint-05-code-inspection.md). Atnaujinimą reikia parinkti suderinamai ir po jo pakartoti patikras.

Sprint 5 įgyvendinimas šio perėmimo metu nepradėtas.
