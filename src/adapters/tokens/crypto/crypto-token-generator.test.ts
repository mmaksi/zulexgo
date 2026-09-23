import { tokenGeneratorContract } from "@/src/core/ports/token-generator.contract"
import { CryptoTokenGenerator } from "./crypto-token-generator"

tokenGeneratorContract("CryptoTokenGenerator", () => new CryptoTokenGenerator())
