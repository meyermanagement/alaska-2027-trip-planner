import PageSkeleton, { Bar, TitleBlock } from "@/components/PageSkeleton";

// Contact is a short form -- a subject line, a message area, an email that
// prefills from the sign-in address, a Send button. The skeleton stands in
// for exactly that shape so the frame does not blink out on the way from
// the menu.
export default function LoadingContact() {
  return (
    <PageSkeleton label="Loading the contact form">
      <TitleBlock />
      <div className="mt-6 card space-y-4 p-5" aria-hidden="true">
        <div className="space-y-2">
          <Bar className="h-4 w-20" />
          <Bar className="h-10 w-full rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Bar className="h-4 w-24" />
          <Bar className="h-32 w-full rounded-2xl" />
        </div>
        <div className="space-y-2">
          <Bar className="h-4 w-16" />
          <Bar className="h-10 w-full max-w-sm rounded-2xl" />
        </div>
        <Bar className="h-9 w-28" />
      </div>
      <div className="mt-8 space-y-2" aria-hidden="true">
        <Bar className="h-3 w-full max-w-md" />
        <Bar className="h-3 w-2/3 max-w-sm" />
      </div>
    </PageSkeleton>
  );
}
