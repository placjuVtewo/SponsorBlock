/*
Parts of this are inspired from code from VideoSegments, but rewritten and under the LGPLv3 license
https://github.com/videosegments/videosegments/commits/f1e111bdfe231947800c6efdd51f62a4e7fef4d4/segmentsbar/segmentsbar.js
*/

'use strict';

import Config from "../config";
import { ActionType, ActionTypes, Category, CategoryActionType, SponsorTime } from "../types";
import Utils from "../utils";
import { getCategoryActionType, getSkippingText } from "../utils/categoryUtils";
const utils = new Utils();

const TOOLTIP_VISIBLE_CLASS = 'sponsorCategoryTooltipVisible';

export interface PreviewBarSegment {
    segment: [number, number];
    category: Category;
    unsubmitted: boolean;
    showLarger: boolean;
}

class PreviewBar {
    container: HTMLUListElement;
    categoryTooltip?: HTMLDivElement;
    tooltipContainer?: HTMLElement;

    parent: HTMLElement;
    onMobileYouTube: boolean;
    onInvidious: boolean;

    segments: PreviewBarSegment[] = [];
    videoDuration = 0;

    constructor(parent: HTMLElement, onMobileYouTube: boolean, onInvidious: boolean) {
        this.container = document.createElement('ul');
        this.container.id = 'previewbar';

        this.parent = parent;
        this.onMobileYouTube = onMobileYouTube;
        this.onInvidious = onInvidious;

        this.createElement(parent);

        this.setupHoverText();
    }

    setupHoverText(): void {
        if (this.onMobileYouTube || this.onInvidious) return;

        // Create label placeholder
        this.categoryTooltip = document.createElement("div");
        this.categoryTooltip.className = "ytp-tooltip-title sponsorCategoryTooltip";

        const tooltipTextWrapper = document.querySelector(".ytp-tooltip-text-wrapper");
        if (!tooltipTextWrapper || !tooltipTextWrapper.parentElement) return;

        // Grab the tooltip from the text wrapper as the tooltip doesn't have its classes on init
        this.tooltipContainer = tooltipTextWrapper.parentElement;
        const titleTooltip = tooltipTextWrapper.querySelector(".ytp-tooltip-title");
        if (!this.tooltipContainer || !titleTooltip) return;

        tooltipTextWrapper.insertBefore(this.categoryTooltip, titleTooltip.nextSibling);

        const seekBar = document.querySelector(".ytp-progress-bar-container");
        if (!seekBar) return;

        let mouseOnSeekBar = false;

        seekBar.addEventListener("mouseenter", () => {
            mouseOnSeekBar = true;
        });

        seekBar.addEventListener("mouseleave", () => {
            mouseOnSeekBar = false;
        });

        const observer = new MutationObserver((mutations) => {
            if (!mouseOnSeekBar || !this.categoryTooltip || !this.tooltipContainer) return;

            // If the mutation observed is only for our tooltip text, ignore
            if (mutations.length === 1 && (mutations[0].target as HTMLElement).classList.contains("sponsorCategoryTooltip")) {
                return;
            }

            const tooltipTextElements = tooltipTextWrapper.querySelectorAll(".ytp-tooltip-text");
            let timeInSeconds: number | null = null;
            let noYoutubeChapters = false;

            for (const tooltipTextElement of tooltipTextElements) {
                if (tooltipTextElement.classList.contains('ytp-tooltip-text-no-title')) noYoutubeChapters = true;

                const tooltipText = tooltipTextElement.textContent;
                if (tooltipText === null || tooltipText.length === 0) continue;

                timeInSeconds = utils.getFormattedTimeToSeconds(tooltipText);

                if (timeInSeconds !== null) break;
            }

            if (timeInSeconds === null) return;

            // Find the segment at that location, using the shortest if multiple found
            let segment: PreviewBarSegment | null = null;
            let currentSegmentLength = Infinity;

            for (const seg of this.segments) {//
                const segmentLength = seg.segment[1] - seg.segment[0];
                const minSize = this.getMinimumSize(seg.showLarger);

                const startTime = segmentLength !== 0 ? seg.segment[0] : Math.floor(seg.segment[0]);
                const endTime = segmentLength > minSize ? seg.segment[1] : Math.ceil(seg.segment[0] + minSize);
                if (startTime <= timeInSeconds && endTime >= timeInSeconds) {
                    if (segmentLength < currentSegmentLength) {
                        currentSegmentLength = segmentLength;
                        segment = seg;
                    }
                }
            }

            if (segment === null && this.tooltipContainer.classList.contains(TOOLTIP_VISIBLE_CLASS)) {
                this.tooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            } else if (segment !== null) {
                this.tooltipContainer.classList.add(TOOLTIP_VISIBLE_CLASS);

                if (segment.unsubmitted) {
                    this.categoryTooltip.textContent = chrome.i18n.getMessage("unsubmitted") + " " + utils.shortCategoryName(segment.category);
                } else {
                    this.categoryTooltip.textContent = utils.shortCategoryName(segment.category);
                }

                // Use the class if the timestamp text uses it to prevent overlapping
                this.categoryTooltip.classList.toggle("ytp-tooltip-text-no-title", noYoutubeChapters);
            }
        });

        observer.observe(tooltipTextWrapper, {
            childList: true,
            subtree: true,
        });
    }

    createElement(parent: HTMLElement): void {
        this.parent = parent;

        if (this.onMobileYouTube) {
            parent.style.backgroundColor = "rgba(255, 255, 255, 0.3)";
            parent.style.opacity = "1";
            
            this.container.style.transform = "none";
        } else if (!this.onInvidious) {
            // Hover listener
            this.parent.addEventListener("mouseenter", () => this.container.classList.add("hovered"));

            this.parent.addEventListener("mouseleave", () => this.container.classList.remove("hovered"));
        }

        

        // On the seek bar
        this.parent.prepend(this.container);
    }

    clear(): void {
        this.videoDuration = 0;
        this.segments = [];

        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }

    set(segments: PreviewBarSegment[], videoDuration: number): void {
        this.clear();
        if (!segments) return;

        this.segments = segments;
        this.videoDuration = videoDuration;

        const sortedSegments = this.segments.sort(({segment: a}, {segment: b}) => {
            // Sort longer segments before short segments to make shorter segments render later
            return (b[1] - b[0]) - (a[1] - a[0]);
        });
        for (const segment of sortedSegments) {
            const bar = this.createBar(segment);

            this.container.appendChild(bar);
        }

        this.createChaptersBar(segments.sort((a, b) => a.segment[0] - b.segment[0]));
    }

    createBar({category, unsubmitted, segment, showLarger}: PreviewBarSegment): HTMLLIElement {
        const bar = document.createElement('li');
        bar.classList.add('previewbar');
        bar.innerHTML = showLarger ? '&nbsp;&nbsp;' : '&nbsp;';

        const fullCategoryName = (unsubmitted ? 'preview-' : '') + category;
        bar.setAttribute('sponsorblock-category', fullCategoryName);

        bar.style.backgroundColor = Config.config.barTypes[fullCategoryName]?.color;
        if (!this.onMobileYouTube) bar.style.opacity = Config.config.barTypes[fullCategoryName]?.opacity;

        bar.style.position = "absolute";
        const duration = segment[1] - segment[0];
        if (segment[1] - segment[0] > 0) bar.style.width = `calc(${this.timeToPercentage(segment[1] - segment[0])} - 2px)`;
        bar.style.left = `calc(${this.timeToPercentage(Math.min(this.videoDuration - Math.max(0, duration), segment[0]))})`;

        return bar;
    }

    createChaptersBar(segments: PreviewBarSegment[]): void {
        //<div class="ytp-chapter-hover-container ytp-exp-chapter-hover-container ytp-exp-chapter-hover-effect" style="margin-right: 2px; width: 458px;"><div class="ytp-progress-bar-padding"></div><div class="ytp-progress-list"><div class="ytp-play-progress ytp-swatch-background-color" style="left: 0px; transform: scaleX(0);"></div><div class="ytp-progress-linear-live-buffer"></div><div class="ytp-load-progress" style="left: 0px; transform: scaleX(1);"></div><div class="ytp-hover-progress ytp-hover-progress-light" style="left: 0px; transform: scaleX(0.708652);"></div><div class="ytp-ad-progress-list"></div></div></div>
        // set specific width (use calc(% - 4px))

        // TODO: run this only once, then just update it in another function

        const progressBar = document.querySelector('.ytp-progress-bar');
        const chapterBar = document.querySelector(".ytp-chapters-container:not(.sponsorBlockChapterBar)") as HTMLElement;
        if (!progressBar || !chapterBar || segments?.length <= 0) return;

        const observer = new MutationObserver((mutations) => {
            const changes: Record<string, CSSStyleDeclaration> = {};
            for (const mutation of mutations) {
                const currentElement = mutation.target as HTMLElement;
                if (mutation.type === "attributes" && mutation.attributeName === "style"
                        && currentElement.parentElement.classList.contains("ytp-progress-list")) {
                    changes[currentElement.classList[0]] = currentElement.style;
                }
            }

            // Go through each newly generated chapter bar and update the width based on changes array
            const generatedChapterBar = document.querySelector(".sponsorBlockChapterBar");
            if (generatedChapterBar) {
                // Width reached so far in decimal percent
                let cursor = 0;

                const sections = generatedChapterBar.querySelectorAll(".ytp-chapter-hover-container") as NodeListOf<HTMLElement>;
                for (const section of sections) {
                    const sectionWidth = parseFloat(section.getAttribute("decimal-width"));

                    for (const className in changes) {
                        const currentChangedElement = section.querySelector(`.${className}`) as HTMLElement;
                        if (currentChangedElement) {
                            const transformScale = parseFloat(changes[className].transform.match(/scaleX\(([0-9.]+?)\)/)[1]);
                            currentChangedElement.style.transform = `scaleX(${Math.min(1, (transformScale - cursor) / sectionWidth)}`;
                        }
                    }

                    cursor += sectionWidth;
                }
            }
        });

        observer.observe(chapterBar, {
            subtree: true,
            attributes: true,
            attributeFilter: ["style"] //TODO: check for left too
        });

        // Create it from cloning
        const newChapterBar = chapterBar.cloneNode(true) as HTMLElement;
        newChapterBar.classList.add("sponsorBlockChapterBar");
        const originalSectionClone = newChapterBar.querySelector(".ytp-chapter-hover-container");

        // Merge overlapping chapters
        const mergedSegments = segments.filter((segment) => getCategoryActionType(segment.category) !== CategoryActionType.POI)
                                    .reduce((acc, curr) => {
            if (acc.length === 0 || curr.segment[0] > acc[acc.length - 1].segment[1]) {
                acc.push(curr);
            } else {
                acc[acc.length - 1].segment[1] = Math.max(acc[acc.length - 1].segment[1], curr.segment[1]);
            }

            return acc;
        }, [] as PreviewBarSegment[]);

        // Modify it to have sections for each segment
        for (let i = 0; i < mergedSegments.length; i++) {
            const segment = mergedSegments[i];
            if (i === 0 && segment.segment[0] > 0) {
                const newBlankSection = originalSectionClone.cloneNode(true) as HTMLElement;
                const blankDuration = segment.segment[0];

                newBlankSection.style.marginRight = "2px";
                newBlankSection.style.width = `calc(${this.timeToPercentage(blankDuration)} - 2px)`;
                newBlankSection.setAttribute("decimal-width", String(this.timeToDecimal(blankDuration)));
                newChapterBar.appendChild(newBlankSection);
            }

            const duration = segment.segment[1] - segment.segment[0];
            const newSection = originalSectionClone.cloneNode(true) as HTMLElement;

            newSection.style.marginRight = "2px";
            newSection.style.width = `calc(${this.timeToPercentage(duration)} - 2px)`;
            newSection.setAttribute("decimal-width", String(this.timeToDecimal(duration)));
            newChapterBar.appendChild(newSection);

            if (segment.segment[1] < this.videoDuration) {
                const nextSegment = mergedSegments[i + 1];
                const newBlankSection = originalSectionClone.cloneNode(true) as HTMLElement;
                const nextTime = nextSegment ? nextSegment.segment[0] : this.videoDuration;
                const blankDuration = nextTime - segment.segment[1];

                newBlankSection.style.marginRight = "2px";
                newBlankSection.style.width = `calc(${this.timeToPercentage(blankDuration)} - 2px)`;
                newBlankSection.setAttribute("decimal-width", String(this.timeToDecimal(blankDuration)));
                newChapterBar.appendChild(newBlankSection);
            }
        }

        originalSectionClone.remove();
        progressBar.prepend(newChapterBar);
        
        // Hide old bar
        chapterBar.style.display = "none";

        // clone stuff
        // Setup mutation listener
        // Modify sizes to meet new scales values
        // Hide old element
    }

    updateChapterText(segments: SponsorTime[], currentTime: number): void {
        if (!segments) return;

        const activeSegments = segments.filter((segment) => {
            return segment.segment[0] <= currentTime && segment.segment[1] >= currentTime;
        });

        this.setActiveSegments(activeSegments);
    }

    /**
     * Adds the text to the chapters slot if not filled by default
     */
    private setActiveSegments(segments: SponsorTime[]): void {
        const chaptersContainer = document.querySelector(".ytp-chapter-container") as HTMLDivElement;

        if (chaptersContainer) {
            // TODO: Check if existing chapters exist (if big chapters menu is available?)

            if (segments.length > 0) {
                chaptersContainer.style.removeProperty("display");

                const chosenSegment = segments.sort((a, b) => {
                    if (a.actionType === ActionType.Chapter && b.actionType !== ActionType.Chapter) {
                        return -1;
                    } else if (a.actionType !== ActionType.Chapter && b.actionType === ActionType.Chapter) {
                        return 1;
                    } else {
                        return (a.segment[0] - b.segment[1]);
                    }
                })[0];

                const chapterButton = chaptersContainer.querySelector("button.ytp-chapter-title") as HTMLButtonElement;
                chapterButton.classList.remove("ytp-chapter-container-disabled");
                chapterButton.disabled = false;

                const chapterTitle = chaptersContainer.querySelector(".ytp-chapter-title-content") as HTMLDivElement;
                chapterTitle.innerText = chosenSegment.description || utils.shortCategoryName(chosenSegment.category);
            } else {
                // Hide chapters menu again
                chaptersContainer.style.display = "none";
            }
        }
    }

    remove(): void {
        this.container.remove();

        if (this.categoryTooltip) {
            this.categoryTooltip.remove();
            this.categoryTooltip = undefined;
        }

        if (this.tooltipContainer) {
            this.tooltipContainer.classList.remove(TOOLTIP_VISIBLE_CLASS);
            this.tooltipContainer = undefined;
        }
    }

    timeToPercentage(time: number): string {
        return Math.min(100, time / this.videoDuration * 100) + '%';
    }

    timeToDecimal(time: number): number {
        return Math.min(1, time / this.videoDuration);
    }

    /*
    * Approximate size on preview bar for smallest element (due to &nbsp)
    */
    getMinimumSize(showLarger = false): number {
        return this.videoDuration * (showLarger ? 0.006 : 0.003);
    }
}

export default PreviewBar;
