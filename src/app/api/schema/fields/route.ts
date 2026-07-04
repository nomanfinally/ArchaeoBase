import { NextResponse } from "next/server";
import {
  defaultGroupColumnIds,
  defaultSampleColumnIds,
  filterableSampleFields,
  groupFields,
  operatorsByKind,
  sampleFields
} from "@/lib/schema/fields";

export async function GET() {
  return NextResponse.json({
    sampleFields,
    groupFields,
    filterableFields: filterableSampleFields,
    operatorsByKind,
    defaults: {
      sample: defaultSampleColumnIds,
      group: defaultGroupColumnIds
    }
  });
}

