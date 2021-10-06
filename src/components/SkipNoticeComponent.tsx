import * as React from "react";
import * as CompileConfig from "../../config.json";
import Config from "../config"
import { Category, ContentContainer, CategoryActionType, SponsorHideType, SponsorTime, NoticeVisbilityMode, ActionType } from "../types";
import NoticeComponent from "./NoticeComponent";
import NoticeTextSelectionComponent from "./NoticeTextSectionComponent";
import SubmissionNotice from "../render/SubmissionNotice";

import { getCategoryActionType, getSkippingText } from "../utils/categoryUtils";

export enum SkipNoticeAction {
    None,
    Upvote,
    Downvote,
    CategoryVote,
    CopyDownvote,
    Unskip
}

export interface SkipNoticeProps {
    segments: SponsorTime[];

    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    closeListener: () => void;
    showKeybindHint?: boolean;
    smaller: boolean;

    unskipTime?: number;
}

export interface SkipNoticeState {
    noticeTitle?: string;

    messages?: string[];
    messageOnClick?: (event: React.MouseEvent) => unknown;

    countdownTime?: number;
    maxCountdownTime?: () => number;
    countdownText?: string;

    skipButtonText?: string;
    skipButtonCallback?: (index: number) => void;
    showSkipButton?: boolean;

    editing?: boolean;
    choosingCategory?: boolean;
    thanksForVotingText?: string; //null until the voting buttons should be hidden

    actionState?: SkipNoticeAction;

    showKeybindHint?: boolean;

    smaller?: boolean;
}

class SkipNoticeComponent extends React.Component<SkipNoticeProps, SkipNoticeState> {
    segments: SponsorTime[];
    autoSkip: boolean;
    // Contains functions and variables from the content script needed by the skip notice
    contentContainer: ContentContainer;

    amountOfPreviousNotices: number;
    showInSecondSlot: boolean;
    audio: HTMLAudioElement;
    
    idSuffix: string;

    noticeRef: React.MutableRefObject<NoticeComponent>;
    categoryOptionRef: React.RefObject<HTMLSelectElement>;

    // Used to update on config change
    configListener: () => void;

    constructor(props: SkipNoticeProps) {
        super(props);
        this.noticeRef = React.createRef();
        this.categoryOptionRef = React.createRef();

        this.segments = props.segments;
        this.autoSkip = props.autoSkip;
        this.contentContainer = props.contentContainer;
        this.audio = null;

        const noticeTitle = getSkippingText(this.segments, this.props.autoSkip);

        const previousSkipNotices = document.getElementsByClassName("sponsorSkipNoticeParent");
        this.amountOfPreviousNotices = previousSkipNotices.length;
        // If there is at least one already in the first slot
        this.showInSecondSlot = previousSkipNotices.length > 0 && [...previousSkipNotices].some(notice => !notice.classList.contains("secondSkipNotice"));

        // Sort segments
        if (this.segments.length > 1) {
            this.segments.sort((a, b) => a.segment[0] - b.segment[0]);
        }
    
        //this is the suffix added at the end of every id
        for (const segment of this.segments) {
            this.idSuffix += segment.UUID;
        }
        this.idSuffix += this.amountOfPreviousNotices;

        // Setup state
        this.state = {
            noticeTitle,
            messages: [],
            messageOnClick: null,

            //the countdown until this notice closes
            maxCountdownTime: () => Config.config.skipNoticeDuration,
            countdownTime: Config.config.skipNoticeDuration,
            countdownText: null,

            skipButtonText: this.getUnskipText(),
            skipButtonCallback: (index) => this.unskip(index),
            showSkipButton: true,

            editing: false,
            choosingCategory: false,
            thanksForVotingText: null,

            actionState: SkipNoticeAction.None,

            showKeybindHint: this.props.showKeybindHint ?? true,

            smaller: this.props.smaller ?? false
        }

        if (!this.autoSkip) {
            // Assume manual skip is only skipping 1 submission
            Object.assign(this.state, this.getUnskippedModeInfo(0, this.getSkipText()));
        }
    }

    componentDidMount(): void {
        if (Config.config.audioNotificationOnSkip && this.audio) {
            this.audio.volume = this.contentContainer().v.volume * 0.1;
            if (this.autoSkip) this.audio.play();
        }
    }

    render(): React.ReactElement {
        const noticeStyle: React.CSSProperties = { }
        if (this.contentContainer().onMobileYouTube) {
            noticeStyle.bottom = "4em";
            noticeStyle.transform = "scale(0.8) translate(10%, 10%)";
        }

        // If it started out as smaller, always keep the 
        // skip button there
        const firstColumn = this.props.smaller ? (
            this.getSkipButton()
        ) : null;

        return (
            <NoticeComponent noticeTitle={this.state.noticeTitle}
                amountOfPreviousNotices={this.amountOfPreviousNotices}
                showInSecondSlot={this.showInSecondSlot}
                idSuffix={this.idSuffix}
                fadeIn={true}
                startFaded={Config.config.noticeVisibilityMode >= NoticeVisbilityMode.FadedForAll 
                    || (Config.config.noticeVisibilityMode >= NoticeVisbilityMode.FadedForAutoSkip && this.autoSkip)}
                timed={true}
                maxCountdownTime={this.state.maxCountdownTime}
                videoSpeed={() => this.contentContainer().v?.playbackRate}
                style={noticeStyle}
                ref={this.noticeRef}
                closeListener={() => this.closeListener()}
                smaller={this.state.smaller}
                limitWidth={true}
                firstColumn={firstColumn}
                bottomRow={[...this.getMessageBoxes(), ...this.getBottomRow() ]}
                onMouseEnter={() => this.onMouseEnter() } >
                    
                {(Config.config.audioNotificationOnSkip) && <audio ref={(source) => { this.audio = source; }}>
                    <source src={chrome.extension.getURL("icons/beep.ogg")} type="audio/ogg"></source>
                </audio>}
            </NoticeComponent>
        );
    }

    getBottomRow(): JSX.Element[] {
        return [
            /* Bottom Row */
            (<tr id={"sponsorSkipNoticeSecondRow" + this.idSuffix}
                key={0}>

                {/* Vote Button Container */}
                {!this.state.thanksForVotingText ?
                    <td id={"sponsorTimesVoteButtonsContainer" + this.idSuffix}
                        className="sponsorTimesVoteButtonsContainer">

                        {/* Upvote Button */}
                        <img id={"sponsorTimesDownvoteButtonsContainer" + this.idSuffix}
                            className="sponsorSkipObject voteButton"
                            style={{marginRight: "10px"}}
                            src={chrome.extension.getURL("icons/thumbs_up.svg")}
                            title={chrome.i18n.getMessage("upvoteButtonInfo")}
                            onClick={() => this.prepAction(SkipNoticeAction.Upvote)}>
                        
                        </img>

                        {/* Report Button */}
                        <img id={"sponsorTimesDownvoteButtonsContainer" + this.idSuffix}
                            className="sponsorSkipObject voteButton"
                            style={{marginRight: "10px"}}
                            src={chrome.extension.getURL("icons/thumbs_down.svg")}
                            title={chrome.i18n.getMessage("reportButtonInfo")}
                            onClick={() => this.prepAction(SkipNoticeAction.Downvote)}>
                        </img>

                        {/* Copy and Downvote Button */}
                        <img id={"sponsorTimesDownvoteButtonsContainer" + this.idSuffix}
                            className="sponsorSkipObject voteButton voteButtonImageCopyDownvote"
                            title={chrome.i18n.getMessage("CopyDownvoteButtonInfo")}
                            src={chrome.extension.getURL("icons/pencil.svg")}
                            onClick={() => this.adjustEditingState(true)}>
                        </img>
                    </td>

                    :

                    <td id={"sponsorTimesVoteButtonInfoMessage" + this.idSuffix}
                            className="sponsorTimesInfoMessage sponsorTimesVoteButtonMessage"
                            style={{marginRight: "10px"}}>

                        {/* Submitted string */}
                        {this.state.thanksForVotingText}

                        {/* Continue Voting Button */}
                        <button id={"sponsorTimesContinueVotingContainer" + this.idSuffix}
                            className="sponsorSkipObject sponsorSkipNoticeButton"
                            title={"Continue Voting"}
                            onClick={() => this.continueVoting()}>
                            {chrome.i18n.getMessage("ContinueVoting")}
                        </button>
                    </td>
                }

                {/* Unskip/Skip Button */}
                {!this.props.smaller ? this.getSkipButton() : null}

                {/* Never show button if autoSkip is enabled */}
                {!this.autoSkip ? "" : 
                    <td className="sponsorSkipNoticeRightSection"
                        key={1}>
                        <button className="sponsorSkipObject sponsorSkipNoticeButton sponsorSkipNoticeRightButton"
                            onClick={this.contentContainer().dontShowNoticeAgain}>

                            {chrome.i18n.getMessage("Hide")}
                        </button>
                    </td>
                }
            </tr>),

            /* Edit Segments Row */
            (this.state.editing &&
                <tr id={"sponsorSkipNoticeEditSegmentsRow" + this.idSuffix}
                    key={2}>
                    <td id={"sponsorTimesEditSegmentsContainer" + this.idSuffix}>

                        {/* Copy Segment */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                onClick={() => this.prepAction(SkipNoticeAction.CopyDownvote)}>
                                {chrome.i18n.getMessage("CopyAndDownvote")}
                        </button>

                        {/* Category vote */}
                        <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                onClick={() => this.openCategoryChooser()}>

                            {chrome.i18n.getMessage("incorrectCategory")}
                        </button>
                    </td>

                </tr>
            ),



            /* Category Chooser Row */
            (this.state.choosingCategory &&
                <tr id={"sponsorSkipNoticeCategoryChooserRow" + this.idSuffix}
                    key={3}>
                    <td>
                        {/* Category Selector */}
                        <select id={"sponsorTimeCategories" + this.idSuffix}
                                className="sponsorTimeCategories sponsorTimeEditSelector"
                                defaultValue={this.segments[0].category} //Just default to the first segment, as we don't know which they'll choose
                                ref={this.categoryOptionRef}>

                            {this.getCategoryOptions()}
                        </select>

                        {/* Submit Button */}
                        {this.segments.length === 1 &&
                            <button className="sponsorSkipObject sponsorSkipNoticeButton"
                                    onClick={() => this.prepAction(SkipNoticeAction.CategoryVote)}>

                                {chrome.i18n.getMessage("submit")}
                            </button>
                        }
                        
                    </td>
                </tr>
            ),

            /* Segment Chooser Row */
            (this.state.actionState !== SkipNoticeAction.None &&
                <tr id={"sponsorSkipNoticeSubmissionOptionsRow" + this.idSuffix}
                    key={4}>
                    <td id={"sponsorTimesSubmissionOptionsContainer" + this.idSuffix}>
                        {this.getSubmissionChooser()}
                    </td>
                </tr>
            )
        ];
    }

    getSkipButton(): JSX.Element {
        if (this.state.showSkipButton && (this.segments.length > 1 
                || getCategoryActionType(this.segments[0].category) !== CategoryActionType.POI
                || this.props.unskipTime)) {
            return (
                <span className="sponsorSkipNoticeUnskipSection">
                    <button id={"sponsorSkipUnskipButton" + this.idSuffix}
                        className="sponsorSkipObject sponsorSkipNoticeButton"
                        style={{marginLeft: "4px"}}
                        onClick={() => this.prepAction(SkipNoticeAction.Unskip)}>

                        {this.state.skipButtonText + (this.state.showKeybindHint ? " (" + Config.config.skipKeybind + ")" : "")}
                    </button>
                </span>
            );
        }
    }

    getSubmissionChooser(): JSX.Element[] {
        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.segments.length; i++) {
            elements.push(
                <button className="sponsorSkipObject sponsorSkipNoticeButton"
                        onClick={() => this.performAction(i)}
                        key={"submission" + i + this.segments[i].category + this.idSuffix}>
                    {(i + 1) + ". " + chrome.i18n.getMessage("category_" + this.segments[i].category)}
                </button>
            );
        }

        return elements;
    }

    onMouseEnter(): void {
        if (this.state.smaller) {
            this.setState({
                smaller: false
            });
        }
    }

    getMessageBoxes(): JSX.Element[] {
        if (this.state.messages.length === 0) {
            // Add a spacer if there is no text
            return [
                <tr id={"sponsorSkipNoticeSpacer" + this.idSuffix}
                    className="sponsorBlockSpacer"
                    key={"messageBoxSpacer"}>
                </tr>
            ];
        }

        const elements: JSX.Element[] = [];

        for (let i = 0; i < this.state.messages.length; i++) {
            elements.push(
                <tr>
                    <td>
                        <NoticeTextSelectionComponent idSuffix={this.idSuffix}
                            text={this.state.messages[i]}
                            onClick={this.state.messageOnClick}
                            key={i + "_messageBox"}>
                        </NoticeTextSelectionComponent>
                    </td>
                </tr>
            )
        }

        return elements;
    }

    prepAction(action: SkipNoticeAction): void {
        const isDownvotingCategory =  (SkipNoticeAction.CategoryVote === action);
        if (this.segments.length === 1) {
            this.performAction(0, action);
        } else {
            this.setState({
                actionState: action,
                editing: false,
                choosingCategory: isDownvotingCategory
            });
        }
    }

    /**
     * Performs the action from the current state
     * 
     * @param index 
     */
    performAction(index: number, action?: SkipNoticeAction): void {
        switch (action ?? this.state.actionState) {
            case SkipNoticeAction.None:
                this.SkipNoticeActionNone(index);
                break;
            case SkipNoticeAction.Upvote:
                this.SkipNoticeActionUpvote(index);
                break;
            case SkipNoticeAction.Downvote:
                this.SkipNoticeActionDownvote(index);
                break;
            case SkipNoticeAction.CategoryVote:
                this.SkipNoticeActionCategoryVote(index);
                break;
            case SkipNoticeAction.CopyDownvote:
                this.skipNoticeActionCopyDownvote(index);
                break;
            case SkipNoticeAction.Unskip:
                this.SkipNoticeActionUnskip(index);
                break;
            default:
                this.setState({
                    actionState: SkipNoticeAction.None,
                    editing: false,
                    choosingCategory: false
                });
                break;
        }
    }

    SkipNoticeActionNone(index: number): void {
        return;
    }

    SkipNoticeActionUpvote(index: number): void {
        this.contentContainer().vote(1, this.segments[index].UUID, undefined, this);

        this.segments[index].hidden = SponsorHideType.Visible; // This doesnt work D:
        this.contentContainer().updatePreviewBar();

        this.setState({
            actionState: SkipNoticeAction.None,
            editing: false,
            choosingCategory: false
        });
    }

    SkipNoticeActionDownvote(index: number): void {
        this.contentContainer().vote(0, this.segments[index].UUID, undefined, this);
        
        this.setState({
            actionState: SkipNoticeAction.None,
            editing: false,
            choosingCategory: false
        });
    }

    SkipNoticeActionCategoryVote(index: number): void {
        this.contentContainer().vote(undefined, this.segments[index].UUID, this.categoryOptionRef.current.value as Category, this)
        
        this.setState({
            actionState: SkipNoticeAction.None,
            editing: false,
            choosingCategory: false
        });
    }

    skipNoticeActionCopyDownvote(index: number): void {
        const sponsorVideoID = this.props.contentContainer().sponsorVideoID;
        const sponsorTimesSubmitting : SponsorTime = {
            segment: this.segments[index].segment,
            UUID: null,
            category: this.segments[index].category,
            actionType: this.segments[index].actionType,
            source: 2
        };
        let segmentTimes = Config.config.segmentTimes.get(sponsorVideoID) || [];
        segmentTimes.push(sponsorTimesSubmitting);
        Config.config.segmentTimes.set(sponsorVideoID, segmentTimes);
        this.props.contentContainer().sponsorTimesSubmitting.push(sponsorTimesSubmitting);
        this.props.contentContainer().updatePreviewBar();
        this.props.contentContainer().resetSponsorSubmissionNotice();
        this.props.contentContainer().updateEditButtonsOnPlayer();

        this.contentContainer().vote(0, this.segments[index].UUID, undefined, this);
        this.setState({
            actionState: SkipNoticeAction.None,
            editing: false,
            choosingCategory: false
        });
    }

    SkipNoticeActionUnskip(index: number): void {
        this.state.skipButtonCallback(index);
        
        this.setState({
            actionState: SkipNoticeAction.None,
            editing: false,
            choosingCategory: false
        });
    }

    adjustEditingState(value: boolean): void {
        this.setState({
            editing: value,
            choosingCategory: false,
            actionState: SkipNoticeAction.None
        });
    }

    openCategoryChooser(): void {
        this.setState({
            choosingCategory: true,
            editing: false
        }, () => {
            if (this.segments.length > 1) {
                // Use the action selectors as a submit button
                this.prepAction(SkipNoticeAction.CategoryVote);
            }
        });
    }

    continueVoting(): void {
        this.setState({
            actionState: SkipNoticeAction.None,
            editing: false,
            choosingCategory: false,
            thanksForVotingText: null,
            messages: []
        });
    }
    getCategoryOptions(): React.ReactElement[] {
        const elements = [];

        const categories = CompileConfig.categoryList.filter((cat => getCategoryActionType(cat as Category) === CategoryActionType.Skippable));
        for (const category of categories) {
            elements.push(
                <option value={category}
                        key={category}>
                    {chrome.i18n.getMessage("category_" + category)}
                </option>
            );
        }

        return elements;
    }

    unskip(index: number): void {
        this.contentContainer().unskipSponsorTime(this.segments[index], this.props.unskipTime);

        this.unskippedMode(index, this.getReskipText());
    }

    reskip(index: number): void {
        this.contentContainer().reskipSponsorTime(this.segments[index]);

        const newState: SkipNoticeState = {
            skipButtonText: this.getUnskipText(),
            skipButtonCallback: this.unskip.bind(this),

            maxCountdownTime: () => Config.config.skipNoticeDuration,
            countdownTime: Config.config.skipNoticeDuration
        };

        // See if the title should be changed
        if (!this.autoSkip) {
            newState.noticeTitle = chrome.i18n.getMessage("noticeTitle");
        }       

        //reset countdown
        this.setState(newState, () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    /** Sets up notice to be not skipped yet */
    unskippedMode(index: number, buttonText: string): void {
        //setup new callback and reset countdown
        this.setState(this.getUnskippedModeInfo(index, buttonText), () => {
            this.noticeRef.current.resetCountdown();
        });
    }

    getUnskippedModeInfo(index: number, buttonText: string): SkipNoticeState {
        const changeCountdown = getCategoryActionType(this.segments[index].category) === CategoryActionType.Skippable;

        const maxCountdownTime = changeCountdown ? () => {
            const sponsorTime = this.segments[index];
            const duration = Math.round((sponsorTime.segment[1] - this.contentContainer().v.currentTime) * (1 / this.contentContainer().v.playbackRate));

            return Math.max(duration, Config.config.skipNoticeDuration);
        } : this.state.maxCountdownTime;

        return {
            skipButtonText: buttonText,
            skipButtonCallback: (index) => this.reskip(index),
            // change max duration to however much of the sponsor is left
            maxCountdownTime: maxCountdownTime,
            countdownTime: maxCountdownTime()
        } as SkipNoticeState;
    }

    afterVote(segment: SponsorTime, type: number, category: Category): void {
        this.addVoteButtonInfo(chrome.i18n.getMessage("voted"));

        if (type === 0) {
            //this.setNoticeInfoMessage(chrome.i18n.getMessage("hitGoBack"));
            const wikiLinkText = Config.config.wikiPages.get(segment.category);
            this.setNoticeInfoMessageWithOnClick(() => window.open(wikiLinkText), chrome.i18n.getMessage("OpenCategoryWikiPage"));
            this.setState({
                editing: false,
                choosingCategory: false,
                actionState: SkipNoticeAction.None
            });
        }
        
        // Change the sponsor locally
        if (segment) {
            if (type === 0) {
                segment.hidden = SponsorHideType.Downvoted;
            } else if (category) {
                segment.category = category;
            }

            this.contentContainer().updatePreviewBar();
        }
    }

    setNoticeInfoMessageWithOnClick(onClick: (event: React.MouseEvent) => unknown, ...messages: string[]): void {
        this.setState({
            messages,
            messageOnClick: (event) => onClick(event)
        });
    }

    setNoticeInfoMessage(...messages: string[]): void {
        this.setState({
            messages
        });
    }
    
    addVoteButtonInfo(message: string): void {
        this.setState({
            thanksForVotingText: message
        });
    }

    resetVoteButtonInfo(): void {
        this.setState({
            thanksForVotingText: null
        });
    }

    closeListener(): void {
        //this.clearConfigListener();

        this.props.closeListener();
    }

    unmutedListener(): void {
        if (this.props.segments.length === 1 
                && this.props.segments[0].actionType === ActionType.Mute 
                && this.contentContainer().v.currentTime >= this.props.segments[0].segment[1]) {
            this.setState({
                showSkipButton: false
            });
        }
    }

    private getUnskipText(): string {
        switch (this.props.segments[0].actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("unmute");
            }
            case ActionType.Skip: 
            default: {
                return chrome.i18n.getMessage("unskip");
            }
        }
    }

    private getReskipText(): string {
        switch (this.props.segments[0].actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip: 
            default: {
                return chrome.i18n.getMessage("reskip");
            }
        }
    }

    private getSkipText(): string {
        switch (this.props.segments[0].actionType) {
            case ActionType.Mute: {
                return chrome.i18n.getMessage("mute");
            }
            case ActionType.Skip: 
            default: {
                return chrome.i18n.getMessage("skip");
            }
        }
    }
}

export default SkipNoticeComponent;
