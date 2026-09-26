import { SiteFooter } from "@/app/_components/site-footer"
import { SiteHeader } from "@/app/_components/site-header"

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </>
  )
}
