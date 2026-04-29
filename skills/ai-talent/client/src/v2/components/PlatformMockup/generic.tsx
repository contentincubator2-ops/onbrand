import React from "react";
import { Card, CardBody, Divider, Skeleton } from "@heroui/react";
import { faNewspaper } from "@fortawesome/free-solid-svg-icons";
import { type MockupFields, MockupHeader } from "./shared";

export function GenericMockup({ title, brief, variantLabel }: MockupFields) {
  return (
    <div className="w-full max-w-[520px] mx-auto">
      <MockupHeader icon={faNewspaper} label="輸出" variantLabel={variantLabel} />
      <Card shadow="lg" radius="lg" className="border border-divider">
        <CardBody className="p-6 gap-3">
          <h2 className="text-medium font-semibold">{title}</h2>
          {brief ? <p className="text-small text-default-500">{brief}</p> : null}
          <Divider />
          <Skeleton className="h-3 w-full rounded" />
          <Skeleton className="h-3 w-[92%] rounded" />
          <Skeleton className="h-3 w-[80%] rounded" />
          <Skeleton className="h-3 w-[68%] rounded" />
        </CardBody>
      </Card>
    </div>
  );
}
