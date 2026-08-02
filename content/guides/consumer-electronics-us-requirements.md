---
slug: consumer-electronics-us-requirements
title: "Consumer Electronics: US Requirements for Cross-Border Sellers"
summary: "Orientation to the main US federal requirements that apply when cross-border sellers offer consumer electronics on Amazon US or their own Shopify storefront, covering radiofrequency authorization, lithium batteries, button and coin cells, and electrical safety expectations."
market: US
platforms: [AMAZON, SHOPIFY]
productCategories: [CONSUMER_ELECTRONICS]
riskAttributes: [BATTERY, WIRELESS_RADIO, ELECTRICAL_SAFETY]
policyTopics: [PRODUCT_SAFETY_RECALLS, IMPORT_CUSTOMS, LISTING_ACCOUNT_HEALTH]
readiness: EXPERIMENTAL
reviewedBy: null
lastReviewedAt: null
draftedBy: kimi-code/k3
draftedAt: 2026-08-03
citationsVerified: false
sources:
  - name: "47 CFR Part 15 — Radio Frequency Devices"
    url: "https://www.ecfr.gov/current/title-47/chapter-I/subchapter-A/part-15"
    authorityLevel: GOVERNMENT_OFFICIAL
    note: "Supports the FCC rules for intentional and unintentional radiators and the equipment authorization procedures (Certification and Supplier's Declaration of Conformity)."
  - name: "16 CFR Part 1263 — Safety Standard for Button Cell or Coin Batteries and Consumer Products Containing Such Batteries"
    url: "https://www.ecfr.gov/current/title-16/chapter-II/subchapter-B/part-1263"
    authorityLevel: GOVERNMENT_OFFICIAL
    note: "Supports the CPSC mandatory standard implementing Reese's Law for button and coin cell battery compartments and labeling."
  - name: "Federal Communications Commission — Equipment Authorization"
    url: "https://www.fcc.gov"
    authorityLevel: GOVERNMENT_OFFICIAL
    note: "Supports the general description of the FCC equipment authorization regime and marketing/import conditions for radiofrequency devices."
  - name: "Pipeline and Hazardous Materials Safety Administration (US DOT)"
    url: "https://www.phmsa.dot.gov"
    authorityLevel: GOVERNMENT_OFFICIAL
    note: "Supports the description of US DOT/PHMSA hazardous materials transport rules (49 CFR) as they apply to lithium batteries."
  - name: "Amazon Seller Central"
    url: "https://sellercentral.amazon.com"
    authorityLevel: PLATFORM_OFFICIAL
    note: "Supports the general description of Amazon documentation requests, category gating, and compliance policy enforcement for electronics listings."
---

## Who this is for

This guide is for cross-border sellers — typically manufacturers or brand owners based outside the United States — who sell consumer electronics into the US market, either through Amazon's US marketplace or through their own Shopify storefront. It applies when the product is a finished electronic device: anything with a circuit board, a power supply, a wireless radio, or a rechargeable battery. It is orientation, not a compliance program. It tells you which US federal regimes exist, which ones are likely to attach to a given product, and where the load-bearing details must be confirmed before you ship.

It does not cover every product category. Medical devices, toys, laser products, and radio transmitters intended for licensed services each carry additional regimes that are outside the scope here. If your product sits near one of those boundaries, treat this guide as a starting point only.

## What changes the decision

Whether a given requirement applies to you turns on product composition and how the product reaches the US customer. The main factors:

- **Wireless capability.** A device that intentionally emits radiofrequency energy — Wi-Fi, Bluetooth, cellular, Zigbee, proprietary RF — is an intentional radiator under FCC rules and faces the strictest authorization path. A device with digital electronics but no radio is usually an unintentional radiator and follows a lighter path. A passive product with no electronics at all falls outside 47 CFR Part 15 entirely.
- **Battery content.** A product containing lithium cells or batteries, or shipped alongside them, triggers dangerous-goods transport rules regardless of where it is sold. A product powered by button or coin cells triggers a specific consumer-safety standard, and the obligations tighten sharply if children could access the battery compartment.
- **Children's use.** Products intended primarily for children twelve years of age or younger are children's products under the Consumer Product Safety Improvement Act of 2008 and carry third-party testing and certification duties that general-use products do not.
- **Mains connection.** Anything that plugs into US wall power draws marketplace scrutiny on electrical safety, even where no single federal mandate requires a specific certification mark.
- **Fulfillment path.** Shipping from overseas direct to the consumer, holding stock in a US warehouse, or using Fulfillment by Amazon changes who acts as importer of record and how transport and customs obligations fall on you.
- **Claims made.** Claims about safety, performance, or compliance in a listing can themselves create liability and will be read against the documentation you hold.

## US requirements

**Radiofrequency devices: FCC authorization.** Under 47 CFR Part 15, the Federal Communications Commission regulates radiofrequency devices in two broad classes. Intentional radiators — devices that deliberately generate and emit RF energy, such as Bluetooth speakers, Wi-Fi cameras, and wireless chargers with communication functions — generally require Certification before they may be marketed or imported into the United States. Certification involves testing at an FCC-recognized accredited laboratory and approval through a Telecommunication Certification Body, with the device receiving an FCC ID. Unintentional radiators — devices that generate RF energy incidentally, such as most powered digital electronics without a radio — are generally subject to the Supplier's Declaration of Conformity procedure, in which the responsible party tests the device and declares conformity without submitting an application to the FCC. The FCC's equipment authorization rules also restrict marketing and importation until the applicable procedure is complete, and the responsible party for equipment authorization must be located in the United States [UNVERIFIED — confirm at source]. Selling a wireless device into the US without the correct authorization is one of the most common and most avoidable compliance failures for cross-border electronics sellers.

**Lithium batteries: transport rules.** Lithium cells and batteries are regulated as hazardous materials in transport. The US Department of Transportation's Pipeline and Hazardous Materials Safety Administration administers the Hazardous Materials Regulations in Title 49 of the Code of Federal Regulations (49 CFR), which govern the classification, packaging, marking, labeling, and documentation of lithium batteries offered for transport in US commerce. Separately, the UN Manual of Tests and Criteria requires that lithium cells and batteries pass the tests in subsection 38.3 (commonly "UN 38.3"), and sellers are routinely asked — by freight forwarders, airlines, and platforms — to produce the UN 38.3 test summary for the cells or batteries in their product. Air transport adds further restrictions through carrier and international rules, which is why lithium battery products frequently face shipment holds. Practical expectation: obtain the UN 38.3 test summary from your cell or battery supplier before you book freight, and confirm the packaging and marking requirements that apply to your shipping configuration under 49 CFR.

**Button and coin cells: Reese's Law.** Reese's Law directed the Consumer Product Safety Commission to establish a mandatory safety standard for consumer products that contain button cell or coin batteries, responding to ingestion injuries in children. The implementing standard is 16 CFR Part 1263, which sets performance requirements for battery compartments — so that a child cannot readily access the cell — and warning-label requirements for the product, its packaging, and accompanying literature. If your product uses a button or coin cell, assume 16 CFR Part 1263 applies unless a specific exemption covers your product, and confirm the current text of the rule before listing.

**Electrical safety: the NRTL scheme.** There is no single federal law requiring consumer electronics generally to carry a UL or ETL mark. What exists federally is OSHA's Nationally Recognized Testing Laboratory (NRTL) program, under which OSHA recognizes private laboratories — UL Solutions and Intertek's ETL among them — to test and certify products to consensus safety standards. The NRTL scheme is legally mandatory primarily for workplace equipment. In consumer e-commerce, however, marketplaces and insurers commonly expect an NRTL test report or certification for mains-powered electronics, and this marketplace expectation functions much like a mandate in practice. Treat "do you have a UL or ETL report" as a question you will be asked, not a question you can wave away.

**Children's products and general safety duties.** The Consumer Product Safety Improvement Act of 2008 imposes third-party testing and Children's Product Certificate requirements on children's products, including electronic ones. For general-use products, the Consumer Product Safety Act still applies: sellers must report products that create a substantial hazard and are subject to recall authority. Importers are treated as manufacturers for these purposes.

**Import basics.** Entry into US commerce runs through US Customs and Border Protection. Country-of-origin marking is required under 19 U.S.C. 1304, and the importer of record is responsible for correct classification, valuation, and duty payment. Specific duty rates for electronics vary by classification and country of origin [UNVERIFIED — confirm at source].

## Amazon US

Amazon acts as a private gatekeeper layered on top of the federal rules. For electronics, sellers should expect the following in general terms:

- **Documentation requests.** Amazon routinely asks sellers of electronics to submit compliance documentation: FCC authorization information for RF devices, UN 38.3 test summaries for lithium battery products, NRTL test reports for mains-powered devices, and product images showing labels and markings. Requests can arrive at listing creation or later, and listings may be suppressed until documents are accepted.
- **Category and product gating.** Some electronics subcategories require approval before listing, and certain battery-containing or wireless products attract additional review.
- **Policy enforcement.** Amazon enforces against products it considers unsafe or non-compliant, including removals and, in serious cases, account-level action. Amazon has also been treated in some US proceedings as bearing responsibility in the product-liability chain for marketplace sales [UNVERIFIED — confirm at source], which is one reason its documentation demands are strict.
- **Recall cooperation.** Products subject to a CPSC recall will be removed, and sellers are expected to cooperate with recall execution.

Exact document lists and submission workflows live in Seller Central and change over time; confirm them there for your specific product.

## Shopify US

On your own Shopify storefront there is no platform gatekeeper reviewing your compliance file. That absence is not a reduction of duty — it means the federal obligations described above land directly and exclusively on you. No one will prompt you for an FCC grant, a UN 38.3 summary, or a 16 CFR Part 1263 assessment before you sell; the first time the question arises may be a CPSC inquiry, a customs hold, a payment-processor review, or litigation. You are also the importer of record (or must arrange one), the party responsible for customs declarations, and the party a regulator or plaintiff will name. Sellers moving from marketplace-only to direct storefronts should build the compliance file before launch rather than after the first order.

## Evidence and limits

This draft is machine-authored (kimi-code/k3) and has NOT been human-reviewed. Citations are unverified: the instruments named are ones the drafting model believes to exist and to govern the topics described, but exact section numbers, effective dates, thresholds, and procedural details must be confirmed against the primary sources before you rely on them. Claims that could not be sourced precisely are marked `[UNVERIFIED — confirm at source]`. This is general information, not legal advice, and it does not create any adviser relationship. State and local rules — including state battery stewardship laws, state chemical-disclosure laws, and local electrical codes — are beyond the cited federal instruments and are out of scope. Confirm every load-bearing detail against the primary sources listed above or with a qualified compliance adviser or attorney.

## Review history

- 2026-08-03 — Drafted by kimi-code/k3 (machine). Awaiting human review; not published.
