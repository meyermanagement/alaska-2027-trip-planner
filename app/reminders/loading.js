import PageSkeleton, {
  PillRow,
  RowsBlock,
  TitleBlock,
} from "@/components/PageSkeleton";

export default function LoadingReminders() {
  return (
    <PageSkeleton label="Loading your reminders">
      <TitleBlock />
      <PillRow widths={["w-14", "w-24", "w-28", "w-28"]} />
      <div className="space-y-4">
        <RowsBlock rows={2} />
        <RowsBlock rows={3} />
      </div>
    </PageSkeleton>
  );
}
