import { lazy } from "react";

export const FieldValidationMapPage = lazy(() =>
  import("../pages/FieldValidationMapPage").then(({ FieldValidationMapPage }) => ({
    default: FieldValidationMapPage,
  })),
);
