import { clockContract } from "@/src/core/ports/clock/clock.contract"
import { SystemClock } from "./system-clock"

clockContract("SystemClock", () => new SystemClock())
