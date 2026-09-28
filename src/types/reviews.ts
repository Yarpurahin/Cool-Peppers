/** One review per completed attempt; editing a review updates the same entry. */
export interface ScenarioReview {
  attemptId: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioVersion: number;
  authorName: string;
  helpful: boolean;
  comment: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
  deleted: boolean;
}

export const REVIEW_PAGE_SIZE = 30;

export interface ScenarioReviewInbox {
  reviews: ScenarioReview[];
  hasMore: boolean;
  /** Counts respect both access rights and active filters. */
  total: number;
  helpfulCount: number;
  /** Only accessible scenarios with at least one review, independent of filters. */
  scenarios: { id: string; title: string }[];
}
