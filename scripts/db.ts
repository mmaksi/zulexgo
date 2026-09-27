import { runDatabaseCommand } from "@/src/config/database"

runDatabaseCommand(process.argv.slice(2)).then(
  (output) => console.log(output),
  (error: Error) => {
    console.error(error.message)
    process.exitCode = 1
  },
)
