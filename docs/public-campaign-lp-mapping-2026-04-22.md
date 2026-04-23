# Consultin Public Campaign → Landing Page Mapping

Date: 2026-04-22
Scope: Google Ads live audit for Consultin campaigns, final URLs, sitelinks, CTA targets, and attribution flow.

## Live Status Summary

- Workspace: `Pmatz`
- Google Ads customer: `6918398354`
- Connection id: `4cf33f16-b091-427b-a65f-e0367420dca9`
- Audit source of truth:
  - campaign/ad final URLs via Google Ads API (`ad_group_ad.ad.final_urls`)
  - sitelinks via Google Ads API (`campaign_asset` + `asset.sitelink_asset`)
  - landing page publication/CTA targets via Consultin public files and live UI

## Campaign Matrix

| Campaign                         | Objective       | Live final URL                                           | Final URL status             | CTA / signup target                                                                        | Tracking strategy                                                                                                                                                        | Sitelinks live?                    | Notes                                                             |
| -------------------------------- | --------------- | -------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ----------------------------------------------------------------- |
| Consultin - Clinicas             | Search          | `https://consultin.pmatz.com/para-clinicas`              | Active ad points here        | `/cadastro-clinica?utm_source=google&utm_medium=cpc&utm_campaign=clinicas&utm_content=...` | Page has hardcoded campaign UTMs in CTA links and also loads `seo-pages.js` to preserve incoming click IDs like `gclid` and append missing params                        | Yes                                | Main mapping is coherent and message match is strong              |
| Consultin - Profissional Liberal | Search          | `https://consultin.pmatz.com/software-para-consultorios` | Active ad points here        | `/cadastro-clinica`                                                                        | Static LP loads `seo-pages.js`, which persists `utm_*`, `gclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `ttclid` in sessionStorage and decorates signup links on click | Yes                                | Legacy paused ad to `/para-medicos` was removed during this audit |
| Consultin - Performance Max      | Performance Max | `https://consultin.pmatz.com/sistema-para-clinicas`      | Asset group final URL active | `/cadastro-clinica`                                                                        | Static LP loads `seo-pages.js`; signup page persists attribution again in the SPA via `publicAttribution.ts` and sends it to signup + public analytics                   | No active campaign sitelinks found | Main mapping is coherent                                          |

## Sitelinks by Campaign

### Consultin - Clinicas

Primary final URL:

- `https://consultin.pmatz.com/para-clinicas`

Live sitelinks:

- `Agendamento Online` → `https://consultin.pmatz.com/agendamento-online`
- `Controle Financeiro` → `https://consultin.pmatz.com/controle-financeiro-clinica`
- `Para Clinicas` → `https://consultin.pmatz.com/para-clinicas`
- `Reducao de Faltas` → `https://consultin.pmatz.com/reducao-de-faltas`

CTA behavior:

- `para-clinicas` uses hardcoded Google campaign UTMs in CTA links.
- `agendamento-online`, `controle-financeiro-clinica`, and `reducao-de-faltas` link to `/cadastro-clinica` without hardcoded query params.
- All four pages load `seo-pages.js`, so incoming attribution is preserved and copied into signup links.

Assessment:

- Intentional landing diversification by feature.
- No broken destination found.
- No mismatch between live sitelinks and published LPs.

### Consultin - Profissional Liberal

Primary final URL:

- `https://consultin.pmatz.com/software-para-consultorios`

Live sitelinks:

- `Para Consultorios` → `https://consultin.pmatz.com/software-para-consultorios`
- `Para Medicos` → `https://consultin.pmatz.com/para-medicos`
- `Para Nutricionistas` → `https://consultin.pmatz.com/para-nutricionistas`
- `Para Psicologos` → `https://consultin.pmatz.com/para-psicologos`

CTA behavior:

- `software-para-consultorios` links to `/cadastro-clinica` and relies on `seo-pages.js` for attribution carry-over.
- `para-medicos`, `para-nutricionistas`, and `para-psicologos` use hardcoded Google campaign UTMs in CTA links and also load `seo-pages.js`.

Assessment:

- Main ad now routes only to `software-para-consultorios`.
- Sitelinks intentionally fragment the traffic by persona.
- This is not a broken mapping, but it means campaign-to-LP analysis must treat sitelink traffic separately from the main final URL.

Sitelink review decision:

- Keep persona sitelinks active for now.
- Reason: live sitelink metrics show the persona links are actually being clicked and are not obviously underperforming the generic sitelink.
- Snapshot during this audit:
  - `Para Medicos` → 7 clicks / 84 impressions / 8.3% CTR
  - `Para Psicologos` → 7 clicks / 86 impressions / 8.1% CTR
  - `Para Consultorios` → 5 clicks / 63 impressions / 7.9% CTR
  - `Para Nutricionistas` → 4 clicks / 77 impressions / 5.2% CTR
- Conclusion: solve the reporting problem in admin by landing path, but do not converge all sitelinks to one LP yet.

### Consultin - Performance Max

Primary final URL:

- `https://consultin.pmatz.com/sistema-para-clinicas`

Live sitelinks:

- None found in `campaign_asset` with `field_type = 'SITELINK'` for the active PMax campaign during this audit.

CTA behavior:

- LP links to `/cadastro-clinica` and relies on `seo-pages.js` to preserve and append attribution into signup.

Assessment:

- Single landing destination.
- No campaign sitelink fragmentation observed.

## Tracking Flow Reference

### Static LPs

Static pages in `app/public/*.html` load `seo-pages.js`.

Behavior:

- reads incoming query params and stores them in `sessionStorage` under `consultin-public-attribution`
- preserves first landing context (`landingPath`, `landingSearch`, `landingReferrer`)
- updates current page context (`pagePath`, `pageSearch`)
- decorates every `/cadastro-clinica` link with available attribution before navigation

Tracked keys:

- `utm_source`
- `utm_medium`
- `utm_campaign`
- `utm_content`
- `utm_term`
- `gclid`
- `gbraid`
- `wbraid`
- `fbclid`
- `msclkid`
- `ttclid`

### SPA / signup flow

The signup and public SPA flow uses `app/src/lib/publicAttribution.ts`.

Behavior:

- keeps attribution alive across SPA navigation
- enriches public analytics events
- sends attribution into `submit-clinic-signup`
- persists signup attribution into `public.clinics.signup_attribution`

## Cleanup Executed During This Audit

Removed legacy paused ad from `Consultin - Profissional Liberal`:

- Removed ad resource: `customers/6918398354/adGroupAds/203887992868~805307550189`
- Removed final URL: `https://consultin.pmatz.com/para-medicos`

Post-cleanup state:

- The campaign now has only one ad remaining.
- Remaining active ad resource: `customers/6918398354/adGroupAds/203887992868~805624789919`
- Remaining active final URL: `https://consultin.pmatz.com/software-para-consultorios`

## Recommended Reporting Interpretation

- Treat the campaign main final URL as the default landing only.
- Break out sitelink LPs as separate landing buckets in any acquisition analysis.
- For `Profissional Liberal`, do not aggregate `para-medicos`, `para-nutricionistas`, and `para-psicologos` blindly into the same LP bucket as `software-para-consultorios`.
- For `Clinicas`, expect feature-page sitelink traffic to distribute across `agendamento-online`, `controle-financeiro-clinica`, and `reducao-de-faltas`.
