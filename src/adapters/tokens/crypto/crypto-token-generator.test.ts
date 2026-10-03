import { tokenGeneratorContract } from "@/src/core/ports/tokens/token-generator.contract"
import { CryptoTokenGenerator } from "./crypto-token-generator"

tokenGeneratorContract("CryptoTokenGenerator", () => new CryptoTokenGenerator())
