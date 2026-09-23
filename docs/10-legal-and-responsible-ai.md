# 10. Legal, Privacy, and Responsible AI Requirements

Status: Product architecture baseline; obtain qualified legal review before launch.

This document identifies engineering implications of current legal/privacy frameworks. It is not legal advice and does not determine Veylune's legal obligations for every deployment.

## 10.1 Product classification assumptions

Veylune processes user photographs and creates derived 3D representations. It may also process facial/body landmarks, depth, segmentation, pose, and other derived representations.

The product must not assume that "processed locally" means "not regulated". Data protection rules can apply to processing even when data is transient or never uploaded. UK ICO guidance explicitly notes that processing can include transient creation/use/deletion and that biometric status depends in part on the purpose and technical processing involved.

## 10.2 Data protection by design

Engineering requirements:

- data minimization
- purpose limitation
- explicit user-facing data flows
- retention controls
- secure deletion
- access controls for any cloud/account mode
- export and portability design
- privacy-preserving diagnostics
- documented subprocessors if cloud features exist

A Data Protection Impact Assessment should be evaluated before commercial deployment in jurisdictions where required.

## 10.3 Biometric boundary

Do not build identity recognition into the core reconstruction product unless there is a separately reviewed product requirement.

Reconstruction can use facial/body analysis without necessarily being an identity-recognition system, but legal treatment depends on the exact technical processing and purpose.

If a future feature uniquely identifies people, treat it as a separate high-risk capability with dedicated legal, security, consent, and governance review.

## 10.4 EU AI Act

The EU AI Act applies risk-based obligations. Article 50 transparency obligations became applicable on 2 August 2026 according to the European Commission's current guidance.

Relevant engineering implications include:

- clearly inform people when required about interaction with AI systems
- support machine-readable marking for AI-generated/manipulated outputs where applicable
- support visible disclosure for applicable deepfake outputs
- maintain provenance and generation metadata
- retain model/pipeline version information
- document intended use and limitations

The exact obligation depends on the deployed feature, context, user role, and distribution model. Legal review is required before EU commercial launch.

Official references:

- https://digital-strategy.ec.europa.eu/en/policies/guidelines-ai-transparency-obligations
- https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act
- https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content

## 10.5 UK GDPR

If Veylune processes personal data of people within scope of UK data protection law, the product must support the applicable principles and lawful processing requirements.

Biometric data processed for uniquely identifying a natural person can constitute special category data. Veylune should therefore avoid unnecessary identification functionality and document the purpose of facial/body processing.

Reference:

- https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/biometric-data-guidance-biometric-recognition/

## 10.6 GDPR

For EU deployments, engineering should support:

- privacy by design/default
- data minimization
- purpose limitation
- storage limitation
- security
- rights workflows where cloud/account features exist
- processor/subprocessor records
- transfer controls where data leaves the EEA

The precise legal basis and obligations depend on the deployment and processing purpose. Legal counsel should determine whether any reconstruction feature constitutes special-category biometric processing.

## 10.7 CCPA/CPRA

For California users, account for current California privacy requirements and definitions. The CCPA statute effective January 1, 2026 includes specific treatment of biometric information used for uniquely identifying a consumer within sensitive personal information.

Engineering implications:

- data inventory
- purpose mapping
- deletion/export support for applicable data
- opt-out/choice mechanisms where required
- disclosure of collection/use categories
- careful treatment of biometric-like derived information

Reference:

- https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf

## 10.8 India DPDP

India's Digital Personal Data Protection Act, 2023 and Digital Personal Data Protection Rules, 2025 must be included in the launch compliance program for India-facing processing.

The final 2025 Rules were notified in November 2025 with a phased commencement schedule. Engineering should therefore avoid assuming that all obligations begin simultaneously.

Engineering requirements should include:

- clear notices
- consent/other lawful processing flows as applicable
- security safeguards
- retention/deletion mechanisms
- user rights workflows where applicable
- child-data handling controls where relevant
- processor/vendor governance for optional cloud services

Official references:

- https://www.meity.gov.in/documents/act-and-policies/digital-personal-data-protection-rules-2025-gDOxUjMtQWa?pageTitle=Digit
- https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf

## 10.9 Children

Do not assume that a general-purpose creative application can ignore child privacy.

Product requirements:

- age/eligibility policy
- child-directed experience analysis
- appropriate consent mechanisms where legally required
- stronger defaults for sharing/export
- safeguards around public galleries or social features

## 10.10 Copyright and training data

Every AI model must have a provenance record:

```text
model
source
license
training disclosure where available
redistribution permission
modification permission
commercial-use status
attribution requirements
restriction notes
```

Do not ship a model merely because its weights are downloadable.

## 10.11 Generated content provenance

Store provenance for generated assets and exports:

- source project
- source images where appropriate
- model versions
- reconstruction pipeline version
- generation timestamp
- user edits
- export pipeline

Where appropriate, add machine-readable provenance/AI-generation metadata to exported content.

## 10.12 Abuse and impersonation

Veylune should not include identity impersonation or recognition as an implicit default feature.

Future sharing/social features must include:

- consent controls
- reporting
- takedown workflow
- abuse handling
- provenance
- clear AI-generated/manipulated labeling
- restrictions for harmful impersonation use cases

## 10.13 Legal release checklist

Before commercial launch:

- privacy policy reviewed
- terms reviewed
- model licenses reviewed
- dependency licenses reviewed
- export-format licenses reviewed
- data-processing inventory completed
- retention schedule approved
- DPIA/risk assessment completed where required
- AI Act applicability assessed
- GDPR/UK GDPR applicability assessed
- CCPA/CPRA applicability assessed
- India DPDP applicability assessed
- children's privacy assessment completed
- incident response process established

## 10.14 Governance

Legal and responsible-AI requirements must remain versioned documentation alongside engineering architecture. Changes in regulations or product features require an ADR/review rather than silent behavior changes.
