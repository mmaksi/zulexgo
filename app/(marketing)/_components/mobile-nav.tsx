"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Menu } from "lucide-react"
import { Button, buttonLink } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"

export type NavItem = { label: string; href: string }

/**
 * site-contract.md §3 — below the desktop breakpoint the nav collapses. The
 * primary action travels into the panel so the mobile header cannot overflow
 * at 320px. Every target is at least 48px (§4.4).
 *
 * The panel is controlled rather than using SheetClose for the destinations:
 * SheetClose is a button, and asking it to render an anchor forces button
 * semantics onto something that navigates. Closing on click keeps the links
 * real links.
 */
export function MobileNav({ items }: { items: readonly NavItem[] }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Menü öffnen"
          />
        }
      >
        <Menu aria-hidden="true" className="size-6" />
      </SheetTrigger>

      <SheetContent side="right" className="w-[min(85vw,20rem)]">
        <SheetHeader>
          <SheetTitle>Menü</SheetTitle>
        </SheetHeader>

        <nav aria-label="Hauptnavigation" className="px-8">
          <ul className="flex flex-col">
            {items.map((item) => (
              <li key={item.href} className="border-b border-border">
                <Link
                  href={item.href}
                  onClick={close}
                  className="flex min-h-12 items-center text-subtitle text-grau transition-colors hover:text-orange-dark"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <SheetFooter>
          <Link
            href="/#leistungen"
            onClick={close}
            className={buttonLink({ className: "w-full" })}
          >
            Abmeldung starten
            <ArrowRight aria-hidden="true" />
          </Link>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
