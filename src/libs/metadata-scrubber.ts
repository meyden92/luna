import * as exifr from 'exifr';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

export type MetadataFinding = {
  category: 'gps' | 'device' | 'author' | 'software' | 'timestamp' | 'thumbnail' | 'provenance' | 'format' | 'unknown';
  label: string;
  severity: 'low' | 'medium' | 'high';
  action: 'keep' | 'strip' | 'unsupported';
  detail?: string;
};

export type MetadataScrubReport = {
  version: 2;
  inspectedAt: string;
  contentType: string;
  findings: MetadataFinding[];
  stripped: boolean;
  parser: 'sharp' | 'marker-scan' | 'pdf-lib' | 'office-zip';
  before?: MetadataFinding[];
  after?: MetadataFinding[];
  errors?: string[];
};

export async function inspectMetadata(buffer: Buffer, contentType: string): Promise<MetadataScrubReport> {
  if (contentType.startsWith('image/')) {
    return inspectImageMetadata(buffer, contentType);
  }

  const markers = scanMarkers(buffer, contentType);
  return {
    version: 2,
    inspectedAt: new Date().toISOString(),
    contentType,
    findings: markers.length
      ? markers
      : [
          {
            category: 'unknown',
            label: 'No supported metadata parser found for this file type.',
            severity: 'low',
            action: 'unsupported',
          },
        ],
    stripped: false,
    parser: 'marker-scan',
    before: markers,
    after: markers,
  };
}

export async function scrubMetadataIfNeeded(
  buffer: Buffer,
  contentType: string,
  shouldStrip: boolean,
): Promise<{ buffer: Buffer; report: MetadataScrubReport }> {
  const report = await inspectMetadata(buffer, contentType);
  if (!shouldStrip) return { buffer, report };
  if (contentType === 'application/pdf') {
    return scrubPdfMetadata(buffer, contentType, report);
  }
  if (isOfficeOpenXml(contentType)) {
    return scrubOfficeMetadata(buffer, contentType, report);
  }
  if (!contentType.startsWith('image/')) {
    return {
      buffer,
      report: {
        ...report,
        findings: report.findings.map((finding) => ({ ...finding, action: 'unsupported' })),
        errors: [...(report.errors ?? []), 'Metadata stripping is not supported for this file type yet.'],
      },
    };
  }

  try {
    const scrubbed = await sharp(buffer).rotate().toBuffer();
    const after = await inspectImageMetadata(scrubbed, contentType);
    const reportAfterStrip: MetadataScrubReport = {
      ...report,
      stripped: true,
      findings: report.findings.map(
        (finding): MetadataFinding => ({
          ...finding,
          action: finding.action === 'unsupported' ? finding.action : 'strip',
        }),
      ),
      before: report.findings,
      after: after.findings,
      errors: after.errors,
    };
    return {
      buffer: scrubbed,
      report: reportAfterStrip,
    };
  } catch {
    return { buffer, report };
  }
}

async function inspectImageMetadata(buffer: Buffer, contentType: string): Promise<MetadataScrubReport> {
  const metadata = await sharp(buffer).metadata();
  const findings: MetadataFinding[] = [];
  const errors: string[] = [];
  const exifFindings = await inspectExifTags(buffer).catch((error: unknown) => {
    errors.push(error instanceof Error ? error.message : 'EXIF parser failed.');
    return [];
  });

  if (metadata.exif) findings.push({ category: 'device', label: 'EXIF metadata block is present.', severity: 'medium', action: 'keep' });
  if (metadata.iptc) findings.push({ category: 'author', label: 'IPTC metadata block is present.', severity: 'medium', action: 'keep' });
  if (metadata.xmp)
    findings.push({
      category: 'provenance',
      label: 'XMP/C2PA-style provenance metadata may be present.',
      severity: 'medium',
      action: 'keep',
    });
  if (metadata.orientation)
    findings.push({ category: 'format', label: `Orientation tag ${metadata.orientation} is present.`, severity: 'low', action: 'keep' });
  if (metadata.icc) findings.push({ category: 'format', label: 'Embedded color profile is present.', severity: 'low', action: 'keep' });
  findings.push(...exifFindings);

  return {
    version: 2,
    inspectedAt: new Date().toISOString(),
    contentType,
    findings: findings.length
      ? findings
      : [{ category: 'format', label: 'No common image metadata blocks detected.', severity: 'low', action: 'keep' }],
    stripped: false,
    parser: 'sharp',
    before: findings,
    after: findings,
    errors,
  };
}

async function inspectExifTags(buffer: Buffer): Promise<MetadataFinding[]> {
  const parsed = await exifr.parse(buffer, true);
  if (!parsed || typeof parsed !== 'object') return [];

  const tags = parsed as Record<string, unknown>;
  const findings: MetadataFinding[] = [];
  const keys = new Set(Object.keys(tags));
  const hasAny = (candidates: string[]) => candidates.some((candidate) => keys.has(candidate));

  if (hasAny(['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'])) {
    findings.push({ category: 'gps', label: 'GPS coordinates are present.', severity: 'high', action: 'keep' });
  }
  if (hasAny(['Make', 'Model', 'LensModel', 'SerialNumber', 'BodySerialNumber'])) {
    findings.push({ category: 'device', label: 'Camera or device identifiers are present.', severity: 'medium', action: 'keep' });
  }
  if (hasAny(['DateTimeOriginal', 'CreateDate', 'ModifyDate', 'DateCreated'])) {
    findings.push({ category: 'timestamp', label: 'Original capture or edit timestamps are present.', severity: 'medium', action: 'keep' });
  }
  if (hasAny(['Artist', 'Creator', 'By-line', 'Copyright', 'Author'])) {
    findings.push({ category: 'author', label: 'Author or copyright metadata is present.', severity: 'medium', action: 'keep' });
  }
  if (hasAny(['Software', 'ProcessingSoftware', 'CreatorTool'])) {
    findings.push({ category: 'software', label: 'Editing or encoder software metadata is present.', severity: 'low', action: 'keep' });
  }
  if (hasAny(['ThumbnailOffset', 'ThumbnailLength'])) {
    findings.push({ category: 'thumbnail', label: 'Embedded thumbnail metadata is present.', severity: 'medium', action: 'keep' });
  }

  return findings;
}

async function scrubPdfMetadata(
  buffer: Buffer,
  contentType: string,
  report: MetadataScrubReport,
): Promise<{ buffer: Buffer; report: MetadataScrubReport }> {
  try {
    const pdf = await PDFDocument.load(buffer, { updateMetadata: false });
    pdf.setTitle('');
    pdf.setAuthor('');
    pdf.setSubject('');
    pdf.setKeywords([]);
    pdf.setProducer('LunaShare');
    pdf.setCreator('LunaShare');
    pdf.setCreationDate(new Date(0));
    pdf.setModificationDate(new Date(0));
    const saved = Buffer.from(await pdf.save({ useObjectStreams: false }));
    const after = await inspectMetadata(saved, contentType);
    return {
      buffer: saved,
      report: {
        ...report,
        parser: 'pdf-lib',
        stripped: true,
        findings: report.findings.map((finding) => ({ ...finding, action: 'strip' })),
        before: report.findings,
        after: after.findings,
        errors: after.errors,
      },
    };
  } catch (error) {
    return {
      buffer,
      report: {
        ...report,
        parser: 'pdf-lib',
        errors: [...(report.errors ?? []), error instanceof Error ? error.message : 'PDF metadata scrub failed.'],
      },
    };
  }
}

async function scrubOfficeMetadata(
  buffer: Buffer,
  contentType: string,
  report: MetadataScrubReport,
): Promise<{ buffer: Buffer; report: MetadataScrubReport }> {
  try {
    const archive = unzipSync(buffer);
    delete archive['docProps/core.xml'];
    delete archive['docProps/app.xml'];
    delete archive['docProps/custom.xml'];

    const rels = archive['_rels/.rels'];
    if (rels) {
      archive['_rels/.rels'] = strToU8(strFromU8(rels).replace(/<Relationship\b[^>]*Target="docProps\/[^"]+"[^>]*\/>/g, ''));
    }

    const contentTypes = archive['[Content_Types].xml'];
    if (contentTypes) {
      archive['[Content_Types].xml'] = strToU8(
        strFromU8(contentTypes).replace(/<Override\b[^>]*PartName="\/docProps\/[^"]+"[^>]*\/>/g, ''),
      );
    }

    const saved = Buffer.from(zipSync(archive));
    const after = await inspectMetadata(saved, contentType);
    return {
      buffer: saved,
      report: {
        ...report,
        parser: 'office-zip',
        stripped: true,
        findings: report.findings.map((finding) => ({ ...finding, action: 'strip' })),
        before: report.findings,
        after: after.findings,
        errors: after.errors,
      },
    };
  } catch (error) {
    return {
      buffer,
      report: {
        ...report,
        parser: 'office-zip',
        errors: [...(report.errors ?? []), error instanceof Error ? error.message : 'Office metadata scrub failed.'],
      },
    };
  }
}

function isOfficeOpenXml(contentType: string): boolean {
  return [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ].includes(contentType);
}

function scanMarkers(buffer: Buffer, contentType: string): MetadataFinding[] {
  const head = buffer.subarray(0, Math.min(buffer.byteLength, 512_000)).toString('latin1').toLowerCase();
  const findings: MetadataFinding[] = [];

  if (head.includes('xmp') || head.includes('photoshop')) {
    findings.push({ category: 'provenance', label: 'XMP or editing metadata marker detected.', severity: 'medium', action: 'unsupported' });
  }
  if (head.includes('author') || head.includes('creator')) {
    findings.push({ category: 'author', label: 'Author/creator metadata marker detected.', severity: 'medium', action: 'unsupported' });
  }
  if (head.includes('gps')) {
    findings.push({ category: 'gps', label: 'GPS metadata marker detected.', severity: 'high', action: 'unsupported' });
  }
  if (contentType.startsWith('video/') || contentType.startsWith('audio/')) {
    findings.push({
      category: 'software',
      label: 'Media container tags may contain encoder/device metadata.',
      severity: 'medium',
      action: 'unsupported',
    });
  }
  if (contentType === 'application/pdf') {
    findings.push({
      category: 'author',
      label: 'PDF document properties may contain author or software metadata.',
      severity: 'medium',
      action: 'unsupported',
    });
  }
  if (isOfficeOpenXml(contentType)) {
    findings.push({
      category: 'author',
      label: 'Office document properties may contain author, company, and editing metadata.',
      severity: 'medium',
      action: 'unsupported',
    });
  }

  return findings;
}
