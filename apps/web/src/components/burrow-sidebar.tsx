import { useState } from "react";
import { TITLE_MAX, type Burrow } from "@deepburrow/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NewPageIcon } from "@/components/new-page-icon";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { toast } from "@/components/ui/sonner";

type Rename = (id: string, title: string) => Promise<string | null>;

type Props = {
  burrows: Burrow[];
  selectedId: string;
  selectedTitle: string;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: Rename;
};

export function BurrowSidebar({
  burrows,
  selectedId,
  selectedTitle,
  onSelect,
  onNew,
  onRename,
}: Props) {
  const { isMobile, setOpenMobile } = useSidebar();
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const choose = (id: string) => {
    onSelect(id);
    if (isMobile) setOpenMobile(false);
  };

  const submitRename = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!renamingId) return;
    const title = renameDraft.trim();
    if (!title) return;
    const error = await onRename(renamingId, title);
    if (error) toast.error(error);
    else setRenamingId(null);
  };

  return (
    <Sidebar testId="burrow-sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-1 px-1">
          <span data-testid="burrow-title" className="min-w-0 flex-1 truncate text-sm font-semibold" title={selectedTitle}>
            {selectedTitle}
          </span>
          <Button
            data-testid="new-burrow"
            aria-label="New burrow"
            title="New burrow"
            size="xs"
            variant="outline"
            className="size-7 shrink-0 p-0"
            onClick={() => {
              onNew();
              if (isMobile) setOpenMobile(false);
            }}
          >
            <NewPageIcon />
          </Button>
        </div>
      </SidebarHeader>

      <SidebarContent data-testid="burrow-list">
        <SidebarGroup>
          <SidebarGroupLabel>Burrows</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {burrows.map((burrow) =>
                renamingId === burrow.id ? (
                  <SidebarMenuItem key={burrow.id}>
                    <form data-testid="rename-burrow-form" onSubmit={submitRename} className="flex gap-1 p-1">
                      <Input
                        autoFocus
                        data-testid={`rename-burrow-${burrow.id}`}
                        aria-label="Burrow title"
                        value={renameDraft}
                        maxLength={TITLE_MAX}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") setRenamingId(null);
                        }}
                        className="h-7 text-xs"
                      />
                      <Button data-testid={`rename-burrow-submit-${burrow.id}`} type="submit" size="xs">
                        Save
                      </Button>
                    </form>
                  </SidebarMenuItem>
                ) : (
                  <SidebarMenuItem key={burrow.id}>
                    <SidebarMenuButton
                      data-testid={`burrow-row-${burrow.id}`}
                      isActive={burrow.id === selectedId}
                      aria-current={burrow.id === selectedId ? "page" : undefined}
                      aria-label={burrow.title}
                      tooltip={burrow.title}
                      onClick={() => choose(burrow.id)}
                    >
                      <span>{burrow.title}</span>
                    </SidebarMenuButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <SidebarMenuAction
                          data-testid={`burrow-menu-${burrow.id}`}
                          aria-label={`Actions for ${burrow.title}`}
                          showOnHover
                        >
                          ⋯
                        </SidebarMenuAction>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" side="right">
                        <DropdownMenuItem
                          data-testid={`burrow-rename-${burrow.id}`}
                          onSelect={() => {
                            setRenamingId(burrow.id);
                            setRenameDraft(burrow.title);
                          }}
                        >
                          Rename
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </SidebarMenuItem>
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

