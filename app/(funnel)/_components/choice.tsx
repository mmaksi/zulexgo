import { RadioGroupItem } from "@/src/ui/radio-group"

/** One answer of a radio group, as a 48 px tap target with its label. */
export function Choice<Value>({ value, label }: { value: Value; label: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-body text-grau-dark">
      <RadioGroupItem value={value} />
      {label}
    </label>
  )
}
