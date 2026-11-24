# n8n-nodes-einvoiceengine

[n8n](https://n8n.io) community node for the [E-Invoicing API](https://einvoiceengine.com): validate, parse, convert and repair European e-invoices — XRechnung 3.0, EN 16931 (UBL and CII), Peppol BIS Billing 3.0, ZUGFeRD / Factur-X (XML or PDF/A-3), Facturae 3.2.x and KSeF FA(3).

Validation uses the official KoSIT validator with the official rule set of each format. Technical validation does not establish legal validity.

## Install

In n8n: **Settings → Community Nodes → Install**, enter `n8n-nodes-einvoiceengine`.

Self-hosted from the command line:

```bash
cd ~/.n8n/nodes && npm install n8n-nodes-einvoiceengine
```

## Credentials

Create an **E-Invoicing API** credential:

| Field | Value |
|---|---|
| API Key | `einv_test_…` (sandbox, free) or `einv_live_…`, from <https://einvoiceengine.com/dashboard/keys> |
| Base URL | `https://einvoiceengine.com` (change only for a self-hosted installation) |

The key is sent as `Authorization: Bearer <key>`. The credential test calls `GET /v1/usage`.

## Operations

| Operation | What it does | Output |
|---|---|---|
| **Validate** | Checks the invoice with the official rules of its format | `status`, `valid`, `detected`, `summary`, `findings[]` (rule id, explanation, suggestion, location) |
| **Parse to JSON** | Reads the invoice into the EN 16931 JSON model | `invoice` (seller, buyer, lines, totals, VAT breakdown …) |
| **Convert** | UBL ↔ CII, to XRechnung, Peppol BIS, ZUGFeRD / Factur-X PDF, Facturae, KSeF; validated and round-trip checked | JSON with `validation` and `target`; the file in a binary property |
| **Repair → Analyze** | Explains a rejection: failing rules, the fields involved, repair proposals | `validation`, `proposals[]` |
| **Repair → Apply Changes** | Applies field changes or proposal ids and validates the result | JSON with `validation` and `applied[]`; the fixed file in a binary property |

**Input:** a binary property (XML or PDF, e.g. from *Read/Write Files from Disk*, *HTTP Request*, *Gmail* or *IMAP* attachments) or XML text.

**Options:** language of explanations (en, de, fr, es, it, pl, nl, pt), store the document in your account (off by default), rule-set version, ZUGFeRD profile, allow data loss, output binary property and file name.

Amounts, tax data and bank or party identifiers are only changed when **Amounts Confirmed** is on, after a person has checked the new values.

## Example workflows

**Check incoming invoices from a mailbox**
IMAP Email (download attachments) → E-Invoicing *Validate* (binary field `attachment_0`) → IF `{{$json.valid}}` → accounting system / notify the sender with `{{$json.findings}}`.

**Produce ZUGFeRD PDFs from UBL**
Read Files → E-Invoicing *Convert* (target *ZUGFeRD / Factur-X PDF*, profile *XRECHNUNG*) → Write Files / Send Email with the binary `data`.

**Fix a missing buyer reference**
E-Invoicing *Repair → Analyze* → review the proposal → E-Invoicing *Repair → Apply Changes* with field `buyerReference`.

## Errors

API errors surface as n8n errors with the HTTP status and the API's message (codes: <https://einvoiceengine.com/docs/errors>). Turn on **Continue On Fail** to pass the error on as an item instead.

## Development

```bash
npm install
npm run build            # tsc + copies icons to dist/
npm run lint             # n8n's community-node linter
```

Link into a local n8n: `npm link` here, then `npm link n8n-nodes-einvoiceengine` in `~/.n8n/custom`.

## Licence

MIT
