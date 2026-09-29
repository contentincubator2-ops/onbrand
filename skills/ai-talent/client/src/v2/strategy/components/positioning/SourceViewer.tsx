/**
 * SourceViewer — small button + modal showing the research sources
 * collected for one segment. Sources live at
 *   positioning._research[segmentId].sources[]
 * and are populated by the pipelineRouter (web fetch + scrape).
 */
import React from "react";
import {
  Button, Chip, Modal, ModalContent, ModalHeader, ModalBody, Card, CardBody,
} from "@heroui/react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookOpen, faArrowUpRightFromSquare, faFileLines,
} from "@fortawesome/free-solid-svg-icons";

interface Source {
  url: string;
  title?: string;
  charCount?: number;
  excerpt?: string;
}

interface SegmentResearch {
  sources?: Source[];
  totalUrls?: number;
  totalChars?: number;
  budget?: { minUrls: number; minChars: number };
  satisfied?: { urls: boolean; chars: boolean };
  finishedAt?: string;
}

export interface SourceViewerProps {
  research: SegmentResearch | null | undefined;
  segmentTitle?: string;
}

export default function SourceViewer({ research, segmentTitle }: SourceViewerProps) {
  const [open, setOpen] = React.useState(false);
  const sources = research?.sources ?? [];
  const totalUrls = research?.totalUrls ?? sources.length;
  const totalChars = research?.totalChars ?? 0;

  if (!research || sources.length === 0) return null;

  return (
    <>
      <Button
        size="sm"
        variant="bordered"
        radius="full"
        startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny" />}
        onPress={() => setOpen(true)}
        className="font-normal"
      >
        <span className="text-default-700">{totalUrls}</span>
        <span className="text-default-400 mx-1">個來源</span>
        <span className="text-default-700">{totalChars.toLocaleString()}</span>
        <span className="text-default-400 ml-1">字</span>
      </Button>

      <Modal isOpen={open} onClose={() => setOpen(false)} size="2xl" scrollBehavior="inside">
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            <Chip size="sm" variant="flat" color="default" className="uppercase tracking-wider self-start"
              startContent={<FontAwesomeIcon icon={faBookOpen} className="text-tiny ml-1" />}>
              研究來源
            </Chip>
            <h2 className="text-medium font-semibold">{segmentTitle ?? "段落引用清單"}</h2>
            <div className="flex items-center gap-2 mt-1">
              <Chip size="sm" variant="flat" color={research?.satisfied?.urls ? "success" : "warning"}>
                URL {totalUrls} / {research?.budget?.minUrls ?? "—"}
              </Chip>
              <Chip size="sm" variant="flat" color={research?.satisfied?.chars ? "success" : "warning"}>
                字數 {totalChars.toLocaleString()} / {research?.budget?.minChars?.toLocaleString() ?? "—"}
              </Chip>
              {research?.finishedAt && (
                <span className="text-tiny text-default-400">
                  {new Date(research.finishedAt).toLocaleString("zh-TW")}
                </span>
              )}
            </div>
          </ModalHeader>
          <ModalBody className="gap-2 pb-5">
            {sources.map((s, i) => (
              <Card key={i} shadow="none" className="border border-divider">
                <CardBody className="px-4 py-3 gap-1">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <Chip size="sm" variant="flat" className="shrink-0">{i + 1}</Chip>
                      <p className="text-small font-medium truncate">{s.title || s.url}</p>
                    </div>
                    {!!s.charCount && (
                      <Chip size="sm" variant="flat" color="default"
                        startContent={<FontAwesomeIcon icon={faFileLines} className="text-tiny ml-1" />}>
                        {(s.charCount).toLocaleString()} 字
                      </Chip>
                    )}
                  </div>
                  {s.url && (
                    <a
                      href={s.url} target="_blank" rel="noopener noreferrer"
                      className="text-tiny text-primary truncate flex items-center gap-1 hover:underline"
                    >
                      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-tiny" />
                      <span className="truncate">{s.url}</span>
                    </a>
                  )}
                  {s.excerpt && (
                    <p className="text-tiny text-default-500 leading-relaxed line-clamp-3 mt-1">
                      {s.excerpt}
                    </p>
                  )}
                </CardBody>
              </Card>
            ))}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
  );
}
