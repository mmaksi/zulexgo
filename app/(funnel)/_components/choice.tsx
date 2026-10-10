import { RadioGroupItem } from "@/src/ui/radio-group"

export function Choice<Value>({ value, label }: { value: Value; label: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 text-body text-grau-dark">
      <RadioGroupItem value={value} />
      {label}
    </label>
  )
}
