import { Body, Button, Container, Head, Heading, Html, Preview, Section, Text } from "react-email"
import { SUPPORT_EMAIL } from "@/src/core/domain/customer/contact"
import type { EmailCopy } from "./copy"

// Mail clients ignore CSS variables, web fonts and stylesheets, and render flexbox and grid unreliably.
const COLOR = {
  ink: "#272828",
  text: "#444c54",
  muted: "#58626d",
  orange: "#f49405",
  orangeDark: "#c37604",
  page: "#f3f4f5",
  card: "#ffffff",
} as const

const FONT = "Arial, Helvetica, sans-serif"

const styles = {
  body: { margin: 0, padding: "24px 0", backgroundColor: COLOR.page, fontFamily: FONT },
  container: { maxWidth: "560px", margin: "0 auto", backgroundColor: COLOR.card },
  brand: { padding: "16px 24px", backgroundColor: COLOR.ink, borderBottom: `4px solid ${COLOR.orange}` },
  wordmark: { margin: 0, fontSize: "20px", fontWeight: 700, letterSpacing: "0.02em", color: "#ffffff" },
  content: { padding: "24px" },
  heading: { margin: "0 0 16px", fontSize: "24px", lineHeight: "32px", color: COLOR.ink },
  text: { margin: "0 0 16px", fontSize: "16px", lineHeight: "24px", color: COLOR.text },
  note: {
    margin: "0 0 16px",
    padding: "12px 16px",
    fontSize: "16px",
    lineHeight: "24px",
    color: COLOR.ink,
    backgroundColor: COLOR.page,
    borderLeft: `4px solid ${COLOR.orangeDark}`,
  },
  button: {
    boxSizing: "border-box",
    display: "inline-block",
    padding: "12px 24px",
    borderRadius: "4px",
    backgroundColor: COLOR.orange,
    color: COLOR.ink,
    fontSize: "16px",
    fontWeight: 700,
    textDecoration: "none",
  },
  footer: { padding: "0 24px 24px", fontSize: "13px", lineHeight: "20px", color: COLOR.muted },
} as const

// Paragraph text is the React key, so one email must not repeat a paragraph.
export function EmailLayout({ preview, heading, paragraphs, note, action }: Omit<EmailCopy, "subject">) {
  return (
    <Html lang="de" dir="ltr">
      <Head />
      <Body lang="de" dir="ltr" style={styles.body}>
        <Preview>{preview}</Preview>
        <Container style={styles.container}>
          <Section style={styles.brand}>
            <Text style={styles.wordmark}>ZulexGO</Text>
          </Section>
          <Section style={styles.content}>
            <Heading as="h1" style={styles.heading}>
              {heading}
            </Heading>
            <Text style={styles.text}>Guten Tag,</Text>
            {paragraphs.map((paragraph) => (
              <Text key={paragraph} style={styles.text}>
                {paragraph}
              </Text>
            ))}
            {note ? <Text style={styles.note}>{note}</Text> : null}
            {action ? (
              <Button href={action.href} style={styles.button}>
                {action.label}
              </Button>
            ) : null}
          </Section>
          <Text style={styles.footer}>
            Diese E-Mail wurde automatisch verschickt. Fragen? Schreiben Sie an {SUPPORT_EMAIL} und nennen Sie Ihre Auftragsnummer.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
