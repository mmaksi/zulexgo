import { TaskLayout } from "@/app/_components/task-layout"

export default function StatusLayout({ children }: LayoutProps<"/status">) {
  return <TaskLayout>{children}</TaskLayout>
}
