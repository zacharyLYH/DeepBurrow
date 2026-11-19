import { Toaster as Sonner, toast } from "sonner";

export { toast };

export function Toaster() {
  return <Sonner position="bottom-center" offset={16} />;
}
