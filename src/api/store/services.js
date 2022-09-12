/* eslint-disable prettier/prettier */
import httpStatus from 'http-status'
import { Op } from 'sequelize'
import CryptoJS from 'crypto-js'
import app from '../../index'
// import jwtHelper from '../../common/helpers/jwt-helper'
import {
  APIError,
  APIErrorV2,
  UnauthorizedError,
  ForbiddenError,
} from '../../common/helpers/api-error'
import { masterDb as Sequelize } from '../../sequelize/index'
import {
  MESSAGE_THROW_ERROR,
  USER_ROLE,
  STATUS_STORE,
  CONFIG_TIME,
  ACTIVE_STATUS
} from '../../common/constant/index'
import UserModel from '../../sequelize/models/user'
import ProductModel from '../../sequelize/models/product'
import StoreModel from '../../sequelize/models/store'
import config from '../../common/config'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcrypt'
import jwtHelper from '../../common/helpers/jwt-helper'
import dayjs from 'dayjs'

const createStore = async (userId, name, image1, image2, image3, description, linkSupport, createdBy) => {
  const res = {}

  const storeNameExist = await StoreModel.findOne({ where: { name } })
  if (storeNameExist) {
    throw new APIError(
      MESSAGE_THROW_ERROR.STORE_NAME_CONFLICT,
      httpStatus.CONFLICT
    )
  }

  const data = await StoreModel.create({
    userId: userId ? userId : createdBy,
    name,
    description,
    linkSupport,
    image1,
    image2,
    image3,
    status: STATUS_STORE.WAITING_FOR_APPROVED,
    createdBy: createdBy,
    createdAt: new Date(),
  })

  res.user = data
  return res
}

const getDetailStore = async (id) => {
  let res = {}

  let queryString = `SELECT st.id, st.user_id as userId, st.name as storeName, st.status, 
  st.image1, st.image2, st.image3, st.description, st.link_support as linkSupport,
  st.created_at as createdAt, st.created_by as createdBy, st.updated_at as updatedAt, st.updated_by as updatedBy,
  us.name as userName
  FROM store st
  LEFT JOIN user us ON us.id = st.user_id
  WHERE st.id = '${id}'`

  const data = await Sequelize.query(queryString, {
    type: Sequelize.QueryTypes.SELECT,
  })

  if (!data) {
    throw new APIError(
      MESSAGE_THROW_ERROR.STORE_NOT_FOUND,
      httpStatus.NOT_FOUND
    )
  }

  res.user = data[0]
  return res
}

const getListStore = async (page, size, search, userId, status, startDate, endDate) => {
  let res = {}
  let offset = (page - 1) * size

  let queryString = `SELECT st.id, st.user_id as userId, st.name as storeName, st.status, 
  st.image1, st.image2, st.image3, st.description, st.link_support as linkSupport,
  st.created_at as createdAt, st.created_by as createdBy, st.updated_at as updatedAt, st.updated_by as updatedBy,
  us.name as userName
  FROM store st
  LEFT JOIN user us ON us.id = st.user_id
  WHERE true`

  if (search) {
    queryString += ` and (st.name like '%${search}%' or st.description like '%${search}%' or us.name like '%${search}%') `
  }

  if (userId) {
    queryString += ` and st.user_id = '${userId}' `
  }

  if (status) {
    queryString += ` and st.status = '${status}' `
  }

  if (startDate) {
    queryString += ` and st.created_at >= '${startDate} ${CONFIG_TIME.START_TIME}' `
  }

  if (endDate) {
    queryString += ` and st.created_at <= '${endDate} ${CONFIG_TIME.END_TIME}' `
  }

  queryString += ` order by st.created_at desc`

  const data = await Sequelize.query(queryString, {
    type: Sequelize.QueryTypes.SELECT,
  })

  if (data && data.length > 0) {
    for (let item of data) {
      item.createdAt = dayjs(item.createdAt).format('DD/MM/YYYY HH:mm:ss')
      item.updatedAt = dayjs(item.updatedAt).format('DD/MM/YYYY HH:mm:ss')
    }
  }

  res.total = data.length
  res.stores = data.slice(offset, offset + size)
  return res
}

const updateStore = async (id, userId, name, image1, image2, image3, description, linkSupport, status, updatedBy) => {
  let res = {}
  let tran = await Sequelize.transaction()

  try {
    const storeExist = await StoreModel.findOne({ where: { id } })
    if (!storeExist) {
      return MESSAGE_THROW_ERROR.STORE_NOT_FOUND
    }

    const data = await StoreModel.update(
      {
        userId: userId ? userId : updatedBy,
        name,
        image1,
        image2,
        image3,
        description,
        linkSupport,
        status,
        updatedBy: updatedBy,
        updatedAt: new Date(),
      },
      { where: { id: id }, transaction: tran }
    )
    //handle update role for user
    if (status === STATUS_STORE.ACTIVE) {
      await UserModel.update(
        { role: USER_ROLE.STORE },
        { where: { id: userId ? userId : updatedBy, status: ACTIVE_STATUS.ACTIVE }, transaction: tran }
      )
    }

    const storeOfUserExist = await StoreModel.findAll({
      where: { userId: userId ? userId : updatedBy, status: STATUS_STORE.ACTIVE },
    })

    if (storeOfUserExist.length === 0) {
      await UserModel.update(
        { role: USER_ROLE.CUSTOMER },
        { where: { id: userId ? userId : updatedBy, status: ACTIVE_STATUS.ACTIVE }, transaction: tran }
      )
    }

    res.data = data
    await tran.commit()
    return res
  } catch (error) {
    await tran.rollback()
    throw new APIError("cập nhật thất bại", httpStatus.BAD_REQUEST)
  }
}

const deleteStore = async (id, userId) => {
  const res = {}

  const storeExist = await StoreModel.findOne({ where: { id } })
  if (!storeExist) {
    throw new APIError(
      MESSAGE_THROW_ERROR.STORE_NOT_FOUND,
      httpStatus.NOT_FOUND
    )
  }

  const data = await StoreModel.destroy({ where: { id } })

  //handle update role for user
  const storeOfUserExist = await StoreModel.findAll({
    where: { userId: userId },
  })

  if (storeOfUserExist.length === 0) {
    await UserModel.update(
      { role: USER_ROLE.CUSTOMER },
      { where: { id: userId } }
    )
  }

  res.user = data
  return res
}

export default {
  createStore,
  getDetailStore,
  getListStore,
  updateStore,
  deleteStore,
}
