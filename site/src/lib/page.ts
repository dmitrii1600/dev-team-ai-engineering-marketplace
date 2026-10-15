import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
import { t } from "../i18n";

export const useDocumentTitle = (title: string): void => {
  useEffect(() => {
    document.title = title;
  }, [title]);
};

/** "<title> · Catalog". */
export const pageTitle = (title: string): string => t("meta.pageTitle", { title });

// Remembers the route visited before the current one, so "← Back" can return to a search.
const visited: { previous: string | null; current: string | null } = { previous: null, current: null };

export const useTrackNavigation = (): void => {
  const { pathname } = useLocation();
  useEffect(() => {
    if (visited.current === pathname) return;
    visited.previous = visited.current;
    visited.current = pathname;
  }, [pathname]);
};

/** Click handler for a "← Back" link: go back to the previous search if that is where the visitor came from. */
export const useBackToSearch = (): ((event: { preventDefault: () => void }) => void) => {
  const navigate = useNavigate();
  return (event) => {
    if (visited.previous === "/search" && window.history.length > 1) {
      event.preventDefault();
      void navigate(-1);
    }
  };
};
