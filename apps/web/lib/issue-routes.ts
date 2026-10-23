const ISSUE_PATH_PATTERN =
  /^\/orgs\/([^/]+)\/projects\/([^/]+)\/issues\/([^/]+)$/;
const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ISSUE_NUMBER = 2_147_483_647;

export type IssueRouteParams = {
  organizationSlug: string;
  projectId: string;
  issueNumber: number;
};

function decodePathSegment(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function normalizeIssueRoute(route: IssueRouteParams): IssueRouteParams | null {
  const organizationSlug = route.organizationSlug.toLowerCase();
  const projectId = route.projectId.toLowerCase();

  if (
    organizationSlug.length > 83 ||
    !ORGANIZATION_SLUG_PATTERN.test(organizationSlug) ||
    !PROJECT_ID_PATTERN.test(projectId) ||
    !Number.isSafeInteger(route.issueNumber) ||
    route.issueNumber < 1 ||
    route.issueNumber > MAX_ISSUE_NUMBER
  ) {
    return null;
  }

  return { organizationSlug, projectId, issueNumber: route.issueNumber };
}

export function isIssuePath(pathname: string): boolean {
  return ISSUE_PATH_PATTERN.test(pathname);
}

export function parseIssuePath(pathname: string): IssueRouteParams | null {
  const match = ISSUE_PATH_PATTERN.exec(pathname);
  if (!match) return null;

  const organizationSegment = match[1];
  const projectSegment = match[2];
  const numberSegment = match[3];
  if (!organizationSegment || !projectSegment || !numberSegment) return null;

  const organizationSlug = decodePathSegment(organizationSegment);
  const projectId = decodePathSegment(projectSegment);
  const issueNumberSegment = decodePathSegment(numberSegment);
  if (!organizationSlug || !projectId || !issueNumberSegment) return null;
  if (!/^[1-9]\d*$/.test(issueNumberSegment)) return null;

  return normalizeIssueRoute({
    organizationSlug,
    projectId,
    issueNumber: Number(issueNumberSegment),
  });
}

export function buildIssuePath(route: IssueRouteParams): string {
  const normalizedRoute = normalizeIssueRoute(route);
  if (!normalizedRoute) {
    throw new TypeError("Invalid issue route parameters");
  }

  return `/orgs/${encodeURIComponent(normalizedRoute.organizationSlug)}/projects/${encodeURIComponent(normalizedRoute.projectId)}/issues/${normalizedRoute.issueNumber}`;
}
