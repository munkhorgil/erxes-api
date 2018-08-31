import { Model, model } from "mongoose";
import * as strip from 'strip';
import { Conversations } from '.';
import { IMessageDocument, messageSchema } from "./definitions/conversationMessages";

interface IMessageParams {
  conversationId: string,
  content: string,
  mentionedUserIds: string[],
  internal: boolean,
  attachments: any,
  tweetReplyToId: string,
  tweetReplyToScreenName: string,
  commentReplyToId: string,
  status?: string,
  userId?: string
}

interface IMessageModel extends Model<IMessageDocument> {
  addMessage(doc: IMessageParams, userId: string): Promise<IMessageDocument>;
  getNonAsnweredMessage(conversationId: string): Promise<IMessageDocument>;
  getAdminMessages(conversationId: string): Promise<IMessageDocument[]>;
  markSentAsReadMessages(conversationId: string): Promise<IMessageDocument>;
}

class Message {
  /**
   * Create a message
   * @param  {Object} messageObj - object
   * @return {Promise} Newly created message object
   */
  public static async createMessage(doc: IMessageParams) {
    const message = await Messages.create({
      internal: false,
      ...doc,
      createdAt: new Date(),
    });

    const messageCount = await Messages.find({
      conversationId: message.conversationId,
    }).count();

    await Conversations.update(
      { _id: message.conversationId },
      {
        $set: {
          messageCount,

          // updating updatedAt
          updatedAt: new Date(),
        },
      },
    );

    // add created user to participators
    await Conversations.addParticipatedUsers(message.conversationId, message.userId);

    // add mentioned users to participators
    for (const userId of message.mentionedUserIds) {
      await Conversations.addParticipatedUsers(message.conversationId, userId);
    }

    return message;
  }

  /**
   * Create a conversation message
   * @param  {Object} doc - Conversation message fields
   * @param  {Object} user - Object
   * @return {Promise} Newly created conversation object
   */
  public static async addMessage(doc: IMessageParams, userId: string) {
    const conversation = await Conversations.findOne({
      _id: doc.conversationId,
    });

    if (!conversation) { throw new Error(`Conversation not found with id ${doc.conversationId}`); }

    // normalize content, attachments
    const content = doc.content || '';
    const attachments = doc.attachments || [];

    doc.content = content;
    doc.attachments = attachments;

    // if there is no attachments and no content then throw content required error
    if (attachments.length === 0 && !strip(content)) { throw new Error('Content is required'); }

    // setting conversation's content to last message
    await Conversations.update({ _id: doc.conversationId }, { $set: { content } });

    return this.createMessage({ ...doc, userId });
  }

  /**
   * User's last non answered question
   * @param  {String} conversationId
   * @return {Promise} Message object
   */
  public static getNonAsnweredMessage(conversationId: string) {
    return Messages.findOne({
      conversationId,
      customerId: { $exists: true },
    }).sort({ createdAt: -1 });
  }

  /**
   * Get admin messages
   * @param  {String} conversationId
   * @return {Promise} messages
   */
  public static getAdminMessages(conversationId: string) {
    return Messages.find({
      conversationId,
      userId: { $exists: true },
      isCustomerRead: false,

      // exclude internal notes
      internal: false,
    }).sort({ createdAt: 1 });
  }

  /**
   * Mark sent messages as read
   * @param  {String} conversationId
   * @return {Promise} Updated messages info
   */
  public static markSentAsReadMessages(conversationId: string) {
    return Messages.update(
      {
        conversationId,
        userId: { $exists: true },
        isCustomerRead: { $exists: false },
      },
      { $set: { isCustomerRead: true } },
      { multi: true },
    );
  }
}

messageSchema.loadClass(Message);

const Messages = model<IMessageDocument, IMessageModel>(
  "conversation_messages",
  messageSchema
);

export default Messages;